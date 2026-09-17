package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
)

const (
	defaultSearchLimit   = 30
	defaultNeighborLimit = 20
	maxUploadBytes       = 10 << 20 // 10MB
)

// Store is everything the handlers need from *DB — lets tests inject a fake.
type Store interface {
	SearchByVector(ctx context.Context, vec []float32, license string, limit int) ([]FontResult, error)
	SearchByText(ctx context.Context, vec []float32, query, license string, limit int) ([]FontResult, error)
	TopVectorSimilarity(ctx context.Context, vec []float32) (float64, error)
	GetFont(ctx context.Context, id int64) (*FontResult, error)
	Neighbors(ctx context.Context, id int64, limit int) ([]FontResult, error)
	UpsertGoogleUser(ctx context.Context, sub, email, name string) (int64, error)
	CreateSession(ctx context.Context, userID int64) (string, error)
	GetUserBySession(ctx context.Context, token string) (*User, error)
	DeleteSession(ctx context.Context, token string) error
}

// Embedder is the subset of *SidecarClient the handlers need — lets tests inject a fake.
type Embedder interface {
	EmbedImageRegions(filename string, data []byte) ([]RegionEmbedding, error)
	EmbedText(text string) ([]float32, error)
}

type Server struct {
	db                      Store
	sidecar                 Embedder
	minTextSearchConfidence float64
	googleClientID          string
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "could not parse upload")
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, http.StatusBadRequest, `missing "image" field`)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read upload")
		return
	}

	embeddings, err := s.sidecar.EmbedImageRegions(header.Filename, data)
	if err != nil {
		log.Printf("sidecar embed failed: %v", err)
		writeError(w, http.StatusBadGateway, "embedding service unavailable")
		return
	}

	license := r.FormValue("license")
	regions := make([]RegionResult, 0, len(embeddings))
	for _, embedding := range embeddings {
		results, err := s.db.SearchByVector(r.Context(), embedding.Vector, license, defaultSearchLimit)
		if err != nil {
			log.Printf("search query failed: %v", err)
			writeError(w, http.StatusInternalServerError, "search failed")
			return
		}
		regions = append(regions, RegionResult{Results: results, Thumbnail: embedding.Thumbnail})
	}

	writeJSON(w, http.StatusOK, regions)
}

type searchTextRequest struct {
	Query   string `json:"query"`
	License string `json:"license"`
}

func (s *Server) handleSearchText(w http.ResponseWriter, r *http.Request) {
	var body searchTextRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "could not parse request body")
		return
	}

	query := strings.TrimSpace(body.Query)
	if query == "" {
		writeError(w, http.StatusBadRequest, `"query" must not be empty`)
		return
	}

	vector, err := s.sidecar.EmbedText(query)
	if err != nil {
		log.Printf("sidecar embed failed: %v", err)
		writeError(w, http.StatusBadGateway, "embedding service unavailable")
		return
	}

	results, err := s.db.SearchByText(r.Context(), vector, query, body.License, defaultSearchLimit)
	if err != nil {
		log.Printf("text search query failed: %v", err)
		writeError(w, http.StatusInternalServerError, "search failed")
		return
	}

	writeJSON(w, http.StatusOK, results)
}

func (s *Server) handleGetFont(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid font id")
		return
	}

	font, err := s.db.GetFont(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "font not found")
		return
	}

	writeJSON(w, http.StatusOK, font)
}

func (s *Server) handleNeighbors(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid font id")
		return
	}

	results, err := s.db.Neighbors(r.Context(), id, defaultNeighborLimit)
	if err != nil {
		log.Printf("neighbors query failed: %v", err)
		writeError(w, http.StatusInternalServerError, "neighbors query failed")
		return
	}

	writeJSON(w, http.StatusOK, results)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("failed to encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
