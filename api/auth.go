package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"google.golang.org/api/idtoken"
)

const (
	sessionDuration   = 30 * 24 * time.Hour
	sessionCookieName = "typeseek_session"
)

type User struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type googleAuthRequest struct {
	Credential string `json:"credential"`
}

func (d *DB) UpsertGoogleUser(ctx context.Context, sub, email, name string) (int64, error) {
	var id int64
	err := d.pool.QueryRow(ctx, `
		INSERT INTO users (google_sub, email, name)
		VALUES ($1, $2, $3)
		ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email, name = excluded.name
		RETURNING id
	`, sub, email, name).Scan(&id)
	return id, err
}

func (d *DB) CreateSession(ctx context.Context, userID int64) (string, error) {
	token, err := generateSessionToken()
	if err != nil {
		return "", err
	}
	_, err = d.pool.Exec(ctx,
		"INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
		token, userID, time.Now().Add(sessionDuration),
	)
	return token, err
}

func (d *DB) GetUserBySession(ctx context.Context, token string) (*User, error) {
	var user User
	err := d.pool.QueryRow(ctx, `
		SELECT users.id, users.email, coalesce(users.name, '')
		FROM sessions
		JOIN users ON users.id = sessions.user_id
		WHERE sessions.token = $1 AND sessions.expires_at > now()
	`, token).Scan(&user.ID, &user.Email, &user.Name)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (d *DB) DeleteSession(ctx context.Context, token string) error {
	_, err := d.pool.Exec(ctx, "DELETE FROM sessions WHERE token = $1", token)
	return err
}

func generateSessionToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func (s *Server) handleGoogleAuth(w http.ResponseWriter, r *http.Request) {
	if s.googleClientID == "" {
		writeError(w, http.StatusServiceUnavailable, "Google sign-in is not configured")
		return
	}

	var body googleAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "could not parse request body")
		return
	}

	payload, err := idtoken.Validate(r.Context(), body.Credential, s.googleClientID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid Google credential")
		return
	}

	sub := payload.Subject
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)

	userID, err := s.db.UpsertGoogleUser(r.Context(), sub, email, name)
	if err != nil {
		log.Printf("upsert google user failed: %v", err)
		writeError(w, http.StatusInternalServerError, "could not sign in")
		return
	}

	s.startSession(w, r, userID)
	writeJSON(w, http.StatusOK, User{ID: userID, Email: email, Name: name})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_ = s.db.DeleteSession(r.Context(), cookie.Value)
	}
	clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user := s.currentUser(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not signed in")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, userID int64) {
	token, err := s.db.CreateSession(r.Context(), userID)
	if err != nil {
		log.Printf("session creation failed: %v", err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(sessionDuration),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})
}

func (s *Server) currentUser(r *http.Request) *User {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil
	}
	user, err := s.db.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		return nil
	}
	return user
}
