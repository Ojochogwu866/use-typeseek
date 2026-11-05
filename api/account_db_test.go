package main

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Runs the account queries against a real, throwaway Postgres; skipped unless TEST_DATABASE_URL is set.
func TestAccountQueriesAgainstPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connecting: %v", err)
	}
	defer pool.Close()
	migration, err := os.ReadFile("../ingestion/db/migrations/002_accounts.sql")
	if err != nil {
		t.Fatalf("reading migration: %v", err)
	}
	setup := `
		DROP TABLE IF EXISTS saved_fonts, trails, preferences, sessions, users, fonts CASCADE;
		CREATE TABLE fonts (id SERIAL PRIMARY KEY, name TEXT, source TEXT, source_url TEXT, license TEXT, category TEXT);
		CREATE TABLE users (id SERIAL PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT NOT NULL, name TEXT, created_at TIMESTAMPTZ DEFAULT now());
		CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL);
		INSERT INTO fonts (name, source, source_url, license, category) VALUES
			('Libre Caslon Display', 'google-fonts', 'u1', 'commercial-ok', 'serif'),
			('Cormorant', 'google-fonts', 'u2', 'commercial-ok', 'serif'),
			('IM Fell French Canon SC', 'google-fonts', 'u3', 'commercial-ok', 'serif');
		INSERT INTO users (google_sub, email, name) VALUES ('sub-1', 'ada@example.com', 'Ada');
	` + string(migration)
	if _, err := pool.Exec(ctx, setup); err != nil {
		t.Fatalf("setting up schema: %v", err)
	}
	db := &DB{pool: pool}
	userID := int64(1)

	if _, err := db.SaveFont(ctx, userID, 2, "elegant thin serif", "", nil); err != nil {
		t.Fatalf("saving without a trail: %v", err)
	}
	saved, err := db.SaveFont(ctx, userID, 3, "a trail", "elegant thin serif", []int64{1, 2, 3})
	if err != nil || saved.TrailID == nil || saved.Font.Name != "IM Fell French Canon SC" {
		t.Fatalf("saving with a trail: %+v, %v", saved, err)
	}
	if _, err := db.SaveFont(ctx, userID, 999, "", "", nil); err != errFontNotFound {
		t.Errorf("saving a missing font: got %v, want errFontNotFound", err)
	}

	list, err := db.ListSaved(ctx, userID)
	if err != nil {
		t.Fatalf("listing: %v", err)
	}
	if len(list.Fonts) != 2 || list.Fonts[0].Font.ID != 3 {
		t.Errorf("saved fonts newest first: got %+v", list.Fonts)
	}
	if len(list.Trails) != 1 {
		t.Fatalf("got %d trails, want 1", len(list.Trails))
	}
	var walked []string
	for _, step := range list.Trails[0].Steps {
		walked = append(walked, step.Name)
	}
	if strings.Join(walked, " → ") != "Libre Caslon Display → Cormorant → IM Fell French Canon SC" {
		t.Errorf("trail steps out of order: %v", walked)
	}

	preferences, err := db.GetPreferences(ctx, userID)
	if err != nil || preferences.PreviewWords != defaultPreviewWords || !preferences.IsMapShown {
		t.Errorf("default preferences: %+v, %v", preferences, err)
	}
	if err := db.SetPreferences(ctx, userID, Preferences{PreviewWords: "Saturday Market", License: "commercial-ok"}); err != nil {
		t.Fatalf("setting preferences: %v", err)
	}
	if preferences, _ := db.GetPreferences(ctx, userID); preferences.PreviewWords != "Saturday Market" || preferences.IsMapShown {
		t.Errorf("preferences not stored: %+v", preferences)
	}

	if err := db.RemoveSavedFont(ctx, userID, 2); err != nil {
		t.Fatalf("removing: %v", err)
	}
	if list, _ := db.ListSaved(ctx, userID); len(list.Fonts) != 1 {
		t.Errorf("after removing, got %d saved fonts, want 1", len(list.Fonts))
	}

	if err := db.DeleteUser(ctx, userID); err != nil {
		t.Fatalf("deleting user: %v", err)
	}
	for _, table := range []string{"saved_fonts", "trails", "preferences", "users"} {
		var count int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&count); err != nil || count != 0 {
			t.Errorf("after deleting the account, %s has %d rows (%v), want 0", table, count, err)
		}
	}
}
