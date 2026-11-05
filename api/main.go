package main

import (
	"context"
	"log"
	"net/http"
)

func main() {
	cfg := loadConfig()
	ctx := context.Background()

	db, err := newDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}

	if cfg.GoogleClientID == "" {
		log.Println("GOOGLE_CLIENT_ID is not set — Google sign-in will be unavailable")
	}

	server := &Server{
		db:                      db,
		sidecar:                 newSidecarClient(cfg.SidecarURL),
		minTextSearchConfidence: cfg.MinTextSearchConfidence,
		googleClientID:          cfg.GoogleClientID,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /search", server.handleSearch)
	mux.HandleFunc("POST /search/text", server.handleSearchText)
	mux.HandleFunc("GET /fonts/{id}", server.handleGetFont)
	mux.HandleFunc("GET /fonts/{id}/neighbors", server.handleNeighbors)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /auth/google", server.handleGoogleAuth)
	mux.HandleFunc("POST /auth/logout", server.handleLogout)
	mux.HandleFunc("GET /auth/me", server.handleMe)
	mux.HandleFunc("GET /me/saved", server.handleListSaved)
	mux.HandleFunc("POST /me/saved", server.handleSaveFont)
	mux.HandleFunc("DELETE /me/saved/{fontID}", server.handleRemoveSaved)
	mux.HandleFunc("DELETE /me/trails/{trailID}", server.handleRemoveTrail)
	mux.HandleFunc("GET /me/preferences", server.handleGetPreferences)
	mux.HandleFunc("PUT /me/preferences", server.handleSetPreferences)
	mux.HandleFunc("GET /me/export", server.handleExport)
	mux.HandleFunc("DELETE /me", server.handleDeleteAccount)

	log.Printf("listening on :%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, withCORS(mux)))
}
