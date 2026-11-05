package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	defaultPreviewWords  = "The Evening Edition"
	maxPreviewWordsRunes = 80
	maxFoundWithRunes    = 200
	maxTrailSteps        = 50
	foreignKeyViolation  = "23503"
)

var errFontNotFound = errors.New("font not found")

type SavedFont struct {
	Font      FontResult `json:"font"`
	FoundWith string     `json:"found_with"`
	TrailID   *int64     `json:"trail_id"`
	SavedAt   time.Time  `json:"saved_at"`
}

type Trail struct {
	ID      int64        `json:"id"`
	Origin  string       `json:"origin"`
	Steps   []FontResult `json:"steps"`
	SavedAt time.Time    `json:"saved_at"`
}

type Preferences struct {
	PreviewWords string `json:"preview_words"`
	License      string `json:"license"`
	IsMapShown   bool   `json:"is_map_shown"`
}

type Saved struct {
	Fonts  []SavedFont `json:"fonts"`
	Trails []Trail     `json:"trails"`
}

type AccountExport struct {
	User        User        `json:"user"`
	Saved       Saved       `json:"saved"`
	Preferences Preferences `json:"preferences"`
	ExportedAt  time.Time   `json:"exported_at"`
}

type saveRequest struct {
	FontID    int64  `json:"font_id"`
	FoundWith string `json:"found_with"`
	Trail     *struct {
		Origin  string  `json:"origin"`
		FontIDs []int64 `json:"font_ids"`
	} `json:"trail"`
}

func defaultPreferences() Preferences {
	return Preferences{PreviewWords: defaultPreviewWords, License: "", IsMapShown: true}
}

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == foreignKeyViolation
}

// SaveFont stores a font for the user, with the trail that reached it when there was one. Saving again updates it.
func (d *DB) SaveFont(ctx context.Context, userID, fontID int64, foundWith, trailOrigin string, trailFontIDs []int64) (*SavedFont, error) {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting save: %w", err)
	}
	defer tx.Rollback(ctx)

	var trailID *int64
	if len(trailFontIDs) > 0 {
		var id int64
		if err := tx.QueryRow(ctx,
			"INSERT INTO trails (user_id, origin, font_ids) VALUES ($1, $2, $3) RETURNING id",
			userID, trailOrigin, trailFontIDs,
		).Scan(&id); err != nil {
			return nil, fmt.Errorf("saving trail: %w", err)
		}
		trailID = &id
	}

	var saved SavedFont
	err = tx.QueryRow(ctx, `
		INSERT INTO saved_fonts (user_id, font_id, found_with, trail_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, font_id) DO UPDATE SET found_with = excluded.found_with, trail_id = excluded.trail_id, created_at = now()
		RETURNING found_with, trail_id, created_at
	`, userID, fontID, foundWith, trailID).Scan(&saved.FoundWith, &saved.TrailID, &saved.SavedAt)
	if isForeignKeyViolation(err) {
		return nil, errFontNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("saving font %d: %w", fontID, err)
	}

	font, err := d.GetFont(ctx, fontID)
	if err != nil {
		return nil, fmt.Errorf("reading saved font %d: %w", fontID, err)
	}
	saved.Font = *font
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing save: %w", err)
	}
	return &saved, nil
}

func (d *DB) RemoveSavedFont(ctx context.Context, userID, fontID int64) error {
	_, err := d.pool.Exec(ctx, "DELETE FROM saved_fonts WHERE user_id = $1 AND font_id = $2", userID, fontID)
	return err
}

func (d *DB) RemoveTrail(ctx context.Context, userID, trailID int64) error {
	_, err := d.pool.Exec(ctx, "DELETE FROM trails WHERE user_id = $1 AND id = $2", userID, trailID)
	return err
}

func (d *DB) ListSaved(ctx context.Context, userID int64) (*Saved, error) {
	saved := &Saved{Fonts: []SavedFont{}, Trails: []Trail{}}
	rows, err := d.pool.Query(ctx, `
		SELECT fonts.id, fonts.name, fonts.category, fonts.license, fonts.source_url,
		       saved_fonts.found_with, saved_fonts.trail_id, saved_fonts.created_at
		FROM saved_fonts
		JOIN fonts ON fonts.id = saved_fonts.font_id
		WHERE saved_fonts.user_id = $1
		ORDER BY saved_fonts.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("listing saved fonts: %w", err)
	}
	for rows.Next() {
		var item SavedFont
		if err := rows.Scan(&item.Font.ID, &item.Font.Name, &item.Font.Category, &item.Font.License, &item.Font.SourceURL,
			&item.FoundWith, &item.TrailID, &item.SavedAt); err != nil {
			rows.Close()
			return nil, fmt.Errorf("reading saved font: %w", err)
		}
		saved.Fonts = append(saved.Fonts, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("listing saved fonts: %w", err)
	}

	// Each trail's steps come back in the order they were walked.
	trailRows, err := d.pool.Query(ctx, `
		SELECT trails.id, trails.origin, trails.created_at,
		       fonts.id, fonts.name, fonts.category, fonts.license, fonts.source_url
		FROM trails
		CROSS JOIN LATERAL unnest(trails.font_ids) WITH ORDINALITY AS step (font_id, position)
		JOIN fonts ON fonts.id = step.font_id
		WHERE trails.user_id = $1
		ORDER BY trails.created_at DESC, step.position
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("listing trails: %w", err)
	}
	defer trailRows.Close()
	indexByID := map[int64]int{}
	for trailRows.Next() {
		var id int64
		var origin string
		var savedAt time.Time
		var step FontResult
		if err := trailRows.Scan(&id, &origin, &savedAt, &step.ID, &step.Name, &step.Category, &step.License, &step.SourceURL); err != nil {
			return nil, fmt.Errorf("reading trail step: %w", err)
		}
		index, exists := indexByID[id]
		if !exists {
			index = len(saved.Trails)
			indexByID[id] = index
			saved.Trails = append(saved.Trails, Trail{ID: id, Origin: origin, SavedAt: savedAt, Steps: []FontResult{}})
		}
		saved.Trails[index].Steps = append(saved.Trails[index].Steps, step)
	}
	if err := trailRows.Err(); err != nil {
		return nil, fmt.Errorf("listing trails: %w", err)
	}
	return saved, nil
}

func (d *DB) GetPreferences(ctx context.Context, userID int64) (*Preferences, error) {
	preferences := defaultPreferences()
	err := d.pool.QueryRow(ctx,
		"SELECT preview_words, license, is_map_shown FROM preferences WHERE user_id = $1", userID,
	).Scan(&preferences.PreviewWords, &preferences.License, &preferences.IsMapShown)
	if errors.Is(err, pgx.ErrNoRows) {
		return &preferences, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading preferences: %w", err)
	}
	return &preferences, nil
}

func (d *DB) SetPreferences(ctx context.Context, userID int64, preferences Preferences) error {
	_, err := d.pool.Exec(ctx, `
		INSERT INTO preferences (user_id, preview_words, license, is_map_shown, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id) DO UPDATE SET
			preview_words = excluded.preview_words, license = excluded.license,
			is_map_shown = excluded.is_map_shown, updated_at = now()
	`, userID, preferences.PreviewWords, preferences.License, preferences.IsMapShown)
	if err != nil {
		return fmt.Errorf("saving preferences: %w", err)
	}
	return nil
}

// DeleteUser removes the user; sessions, saved fonts, trails and preferences go with it by cascade.
func (d *DB) DeleteUser(ctx context.Context, userID int64) error {
	_, err := d.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", userID)
	if err != nil {
		return fmt.Errorf("deleting user %d: %w", userID, err)
	}
	return nil
}

// requireUser writes 401 and returns nil when the request has no live session.
func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) *User {
	user := s.currentUser(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not signed in")
	}
	return user
}

func (s *Server) handleListSaved(w http.ResponseWriter, r *http.Request) {
	user := s.requireUser(w, r)
	if user == nil {
		return
	}
	saved, err := s.db.ListSaved(r.Context(), user.ID)
	if err != nil {
		log.Printf("list saved for user %d: %v", user.ID, err)
		writeError(w, http.StatusInternalServerError, "could not load your saved fonts")
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleSaveFont(w http.ResponseWriter, r *http.Request) {
	user := s.requireUser(w, r)
	if user == nil {
		return
	}
	var body saveRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.FontID <= 0 {
		writeError(w, http.StatusBadRequest, "send a font_id to save")
		return
	}
	foundWith := strings.TrimSpace(body.FoundWith)
	if utf8.RuneCountInString(foundWith) > maxFoundWithRunes {
		writeError(w, http.StatusBadRequest, "found_with is too long")
		return
	}
	var trailOrigin string
	var trailFontIDs []int64
	if body.Trail != nil && len(body.Trail.FontIDs) > 0 {
		if len(body.Trail.FontIDs) > maxTrailSteps || utf8.RuneCountInString(body.Trail.Origin) > maxFoundWithRunes {
			writeError(w, http.StatusBadRequest, "trail is too long")
			return
		}
		trailOrigin = strings.TrimSpace(body.Trail.Origin)
		trailFontIDs = body.Trail.FontIDs
	}

	saved, err := s.db.SaveFont(r.Context(), user.ID, body.FontID, foundWith, trailOrigin, trailFontIDs)
	if errors.Is(err, errFontNotFound) {
		writeError(w, http.StatusNotFound, "font not found")
		return
	}
	if err != nil {
		log.Printf("save font %d for user %d: %v", body.FontID, user.ID, err)
		writeError(w, http.StatusInternalServerError, "could not save this font")
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (s *Server) handleRemoveSaved(w http.ResponseWriter, r *http.Request) {
	user := s.requireUser(w, r)
	if user == nil {
		return
	}
	fontID, err := strconv.ParseInt(r.PathValue("fontID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "font id must be a number")
		return
	}
	if err := s.db.RemoveSavedFont(r.Context(), user.ID, fontID); err != nil {
		log.Printf("remove saved font %d for user %d: %v", fontID, user.ID, err)
		writeError(w, http.StatusInternalServerError, "could not remove this font")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRemoveTrail(w http.ResponseWriter, r *http.Request) {
	user := s.requireUser(w, r)
	if user == nil {
		return
	}
	trailID, err := strconv.ParseInt(r.PathValue("trailID"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "trail id must be a number")
		return
	}
	if err := s.db.RemoveTrail(r.Context(), user.ID, trailID); err != nil {
		log.Printf("remove trail %d for user %d: %v", trailID, user.ID, err)
		writeError(w, http.StatusInternalServerError, "could not remove this trail")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleGetPreferences(w http.ResponseWriter, r *http.Request) {
	user := s.requireUser(w, r)
	if user == nil {
		return
	}
	preferences, err := s.db.GetPreferences(r.Context(), user.ID)
	if err != nil {
		log.Printf("get preferences for user %d: %v", user.ID, err)
		writeError(w, http.StatusInternalServerError, "could not load your preferences")
		return
	}
	writeJSON(w, http.StatusOK, preferences)
}

func validatePreferences(preferences *Preferences) error {
	preferences.PreviewWords = strings.TrimSpace(preferences.PreviewWords)
	if preferences.PreviewWords == "" {
		preferences.PreviewWords = defaultPreviewWords
	}
	if utf8.RuneCountInString(preferences.PreviewWords) > maxPreviewWordsRunes {
		return fmt.Errorf("preview words can be at most %d characters", maxPreviewWordsRunes)
	}
	if preferences.License != "" && preferences.License != "commercial-ok" {
		return errors.New(`license must be "" or "commercial-ok"`)
	}
	return nil
}

func (s *Server) handleSetPreferences(w http.ResponseWriter, r *http.Request) {
	user := s.requireUser(w, r)
	if user == nil {
		return
	}
	var preferences Preferences
	if err := json.NewDecoder(r.Body).Decode(&preferences); err != nil {
		writeError(w, http.StatusBadRequest, "could not parse request body")
		return
	}
	if err := validatePreferences(&preferences); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.db.SetPreferences(r.Context(), user.ID, preferences); err != nil {
		log.Printf("set preferences for user %d: %v", user.ID, err)
		writeError(w, http.StatusInternalServerError, "could not save your preferences")
		return
	}
	writeJSON(w, http.StatusOK, preferences)
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	user := s.requireUser(w, r)
	if user == nil {
		return
	}
	saved, err := s.db.ListSaved(r.Context(), user.ID)
	if err != nil {
		log.Printf("export saved for user %d: %v", user.ID, err)
		writeError(w, http.StatusInternalServerError, "could not prepare your data")
		return
	}
	preferences, err := s.db.GetPreferences(r.Context(), user.ID)
	if err != nil {
		log.Printf("export preferences for user %d: %v", user.ID, err)
		writeError(w, http.StatusInternalServerError, "could not prepare your data")
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="typeseek-data.json"`)
	writeJSON(w, http.StatusOK, AccountExport{User: *user, Saved: *saved, Preferences: *preferences, ExportedAt: time.Now().UTC()})
}

func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	user := s.requireUser(w, r)
	if user == nil {
		return
	}
	if err := s.db.DeleteUser(r.Context(), user.ID); err != nil {
		log.Printf("delete account %d: %v", user.ID, err)
		writeError(w, http.StatusInternalServerError, "could not delete your account")
		return
	}
	clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}
