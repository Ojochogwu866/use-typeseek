package main

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeStore struct {
	topSimilarity      float64
	searchByTextCalled bool
	searchByTextResult []FontResult
	searchByVectorCall int
	searchByVectorFn   func(call int, vec []float32, license string) []FontResult
}

func (f *fakeStore) SearchByVector(ctx context.Context, vec []float32, license string, limit int) ([]FontResult, error) {
	f.searchByVectorCall++
	if f.searchByVectorFn != nil {
		return f.searchByVectorFn(f.searchByVectorCall, vec, license), nil
	}
	return nil, nil
}

func (f *fakeStore) SearchByText(ctx context.Context, vec []float32, query, license string, limit int) ([]FontResult, error) {
	f.searchByTextCalled = true
	return f.searchByTextResult, nil
}

func (f *fakeStore) TopVectorSimilarity(ctx context.Context, vec []float32) (float64, error) {
	return f.topSimilarity, nil
}

func (f *fakeStore) GetFont(ctx context.Context, id int64) (*FontResult, error) { return nil, nil }
func (f *fakeStore) Neighbors(ctx context.Context, id int64, limit int) ([]FontResult, error) {
	return nil, nil
}
func (f *fakeStore) UpsertGoogleUser(ctx context.Context, sub, email, name string) (int64, error) {
	return 0, nil
}
func (f *fakeStore) CreateSession(ctx context.Context, userID int64) (string, error) { return "", nil }
func (f *fakeStore) GetUserBySession(ctx context.Context, token string) (*User, error) {
	return nil, nil
}
func (f *fakeStore) DeleteSession(ctx context.Context, token string) error { return nil }

type fakeEmbedder struct {
	regions []RegionEmbedding
}

func (f *fakeEmbedder) EmbedImageRegions(filename string, data []byte) ([]RegionEmbedding, error) {
	return f.regions, nil
}

func (f *fakeEmbedder) EmbedText(text string) ([]float32, error) {
	return []float32{0.1, 0.2, 0.3}, nil
}

func TestHandleSearchText_BelowConfidenceReturnsEmpty(t *testing.T) {
	store := &fakeStore{topSimilarity: 0.05, searchByTextResult: []FontResult{{ID: 1, Name: "Should not appear"}}}
	server := &Server{db: store, sidecar: &fakeEmbedder{}, minTextSearchConfidence: 0.15}

	body, _ := json.Marshal(searchTextRequest{Query: "hi"})
	req := httptest.NewRequest(http.MethodPost, "/search/text", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	server.handleSearchText(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	var results []FontResult
	if err := json.NewDecoder(rec.Body).Decode(&results); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(results) != 1 || results[0].Name != "Should not appear" {
		t.Errorf("results = %v, want lexical results even when vector confidence is low", results)
	}
	if !store.searchByTextCalled {
		t.Error("SearchByText was not called when lexical results should remain available")
	}
}

func TestHandleSearchText_AboveConfidenceCallsThrough(t *testing.T) {
	want := []FontResult{{ID: 1, Name: "Shrikhand"}}
	store := &fakeStore{topSimilarity: 0.5, searchByTextResult: want}
	server := &Server{db: store, sidecar: &fakeEmbedder{}, minTextSearchConfidence: 0.15}

	body, _ := json.Marshal(searchTextRequest{Query: "bold rounded"})
	req := httptest.NewRequest(http.MethodPost, "/search/text", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	server.handleSearchText(rec, req)

	if !store.searchByTextCalled {
		t.Error("SearchByText was not called despite similarity being above the confidence threshold")
	}
	var results []FontResult
	if err := json.NewDecoder(rec.Body).Decode(&results); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(results) != 1 || results[0].Name != "Shrikhand" {
		t.Errorf("results = %v, want %v", results, want)
	}
}

func newMultipartImageRequest(t *testing.T, fieldName, filename string, data []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if fieldName != "" {
		part, err := writer.CreateFormFile(fieldName, filename)
		if err != nil {
			t.Fatalf("CreateFormFile: %v", err)
		}
		part.Write(data)
	}
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/search", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestHandleSearch_FansOutOneRegionPerEmbedding(t *testing.T) {
	embedder := &fakeEmbedder{regions: []RegionEmbedding{
		{Vector: []float32{1, 0}, Thumbnail: ""},
		{Vector: []float32{0, 1}, Thumbnail: "aGVsbG8="},
	}}
	store := &fakeStore{
		searchByVectorFn: func(call int, vec []float32, license string) []FontResult {
			return []FontResult{{ID: int64(call), Name: "font-for-region"}}
		},
	}
	server := &Server{db: store, sidecar: embedder}

	req := newMultipartImageRequest(t, "image", "photo.png", []byte("fake-image-bytes"))
	rec := httptest.NewRecorder()

	server.handleSearch(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var regions []RegionResult
	if err := json.NewDecoder(rec.Body).Decode(&regions); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(regions) != 2 {
		t.Fatalf("got %d regions, want 2 (one per embedding)", len(regions))
	}
	if store.searchByVectorCall != 2 {
		t.Errorf("SearchByVector called %d times, want 2", store.searchByVectorCall)
	}
	if regions[1].Thumbnail != "aGVsbG8=" {
		t.Errorf("second region thumbnail = %q, want it preserved from the embedding", regions[1].Thumbnail)
	}
}

func TestHandleSearch_MissingImageFieldReturns400(t *testing.T) {
	server := &Server{db: &fakeStore{}, sidecar: &fakeEmbedder{}}

	req := newMultipartImageRequest(t, "", "", nil)
	rec := httptest.NewRecorder()

	server.handleSearch(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}
