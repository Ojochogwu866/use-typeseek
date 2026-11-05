package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func (f *fakeStore) SaveFont(ctx context.Context, userID, fontID int64, foundWith, trailOrigin string, trailFontIDs []int64) (*SavedFont, error) {
	return nil, nil
}
func (f *fakeStore) RemoveSavedFont(ctx context.Context, userID, fontID int64) error { return nil }
func (f *fakeStore) RemoveTrail(ctx context.Context, userID, trailID int64) error    { return nil }
func (f *fakeStore) ListSaved(ctx context.Context, userID int64) (*Saved, error)     { return nil, nil }
func (f *fakeStore) GetPreferences(ctx context.Context, userID int64) (*Preferences, error) {
	return nil, nil
}
func (f *fakeStore) SetPreferences(ctx context.Context, userID int64, preferences Preferences) error {
	return nil
}
func (f *fakeStore) DeleteUser(ctx context.Context, userID int64) error { return nil }

// accountStore is a fakeStore with a signed-in user and recorded account calls.
type accountStore struct {
	fakeStore
	user          *User
	savedFontID   int64
	savedTrail    []int64
	saveErr       error
	preferences   *Preferences
	deletedUserID int64
}

func (a *accountStore) GetUserBySession(ctx context.Context, token string) (*User, error) {
	if token != "good" {
		return nil, errFontNotFound
	}
	return a.user, nil
}

func (a *accountStore) SaveFont(ctx context.Context, userID, fontID int64, foundWith, trailOrigin string, trailFontIDs []int64) (*SavedFont, error) {
	if a.saveErr != nil {
		return nil, a.saveErr
	}
	a.savedFontID = fontID
	a.savedTrail = trailFontIDs
	return &SavedFont{Font: FontResult{ID: fontID, Name: "Cormorant"}, FoundWith: foundWith}, nil
}

func (a *accountStore) ListSaved(ctx context.Context, userID int64) (*Saved, error) {
	return &Saved{Fonts: []SavedFont{}, Trails: []Trail{}}, nil
}

func (a *accountStore) GetPreferences(ctx context.Context, userID int64) (*Preferences, error) {
	preferences := defaultPreferences()
	return &preferences, nil
}

func (a *accountStore) SetPreferences(ctx context.Context, userID int64, preferences Preferences) error {
	a.preferences = &preferences
	return nil
}

func (a *accountStore) DeleteUser(ctx context.Context, userID int64) error {
	a.deletedUserID = userID
	return nil
}

func newAccountServer() (*Server, *accountStore) {
	store := &accountStore{user: &User{ID: 7, Email: "ada@example.com", Name: "Ada"}}
	return &Server{db: store, sidecar: &fakeEmbedder{}}, store
}

func signedIn(request *http.Request) *http.Request {
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "good"})
	return request
}

func TestAccountEndpointsNeedASignedInUser(t *testing.T) {
	server, _ := newAccountServer()
	handlers := map[string]http.HandlerFunc{
		"list saved": server.handleListSaved, "save": server.handleSaveFont, "preferences": server.handleGetPreferences,
		"export": server.handleExport, "delete account": server.handleDeleteAccount,
	}
	for name, handler := range handlers {
		recorder := httptest.NewRecorder()
		handler(recorder, httptest.NewRequest(http.MethodGet, "/", strings.NewReader("{}")))
		if recorder.Code != http.StatusUnauthorized {
			t.Errorf("%s without a session: got %d, want 401", name, recorder.Code)
		}
	}
}

func TestSavingAFontKeepsTheTrailThatReachedIt(t *testing.T) {
	server, store := newAccountServer()
	body := `{"font_id": 12, "found_with": "elegant thin serif", "trail": {"origin": "elegant thin serif", "font_ids": [3, 12]}}`
	recorder := httptest.NewRecorder()
	server.handleSaveFont(recorder, signedIn(httptest.NewRequest(http.MethodPost, "/me/saved", strings.NewReader(body))))

	if recorder.Code != http.StatusCreated {
		t.Fatalf("got %d, want 201: %s", recorder.Code, recorder.Body)
	}
	if store.savedFontID != 12 || len(store.savedTrail) != 2 {
		t.Errorf("saved font %d with trail %v, want 12 with [3 12]", store.savedFontID, store.savedTrail)
	}
}

func TestSavingAFontThatDoesNotExistIsNotFound(t *testing.T) {
	server, store := newAccountServer()
	store.saveErr = errFontNotFound
	recorder := httptest.NewRecorder()
	server.handleSaveFont(recorder, signedIn(httptest.NewRequest(http.MethodPost, "/me/saved", strings.NewReader(`{"font_id": 999999}`))))
	if recorder.Code != http.StatusNotFound {
		t.Errorf("got %d, want 404", recorder.Code)
	}
}

func TestSavingRejectsAMissingFontID(t *testing.T) {
	server, _ := newAccountServer()
	recorder := httptest.NewRecorder()
	server.handleSaveFont(recorder, signedIn(httptest.NewRequest(http.MethodPost, "/me/saved", strings.NewReader(`{"found_with": "x"}`))))
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", recorder.Code)
	}
}

func TestPreferencesFallBackToTheDefaultWordsAndRejectUnknownLicences(t *testing.T) {
	server, store := newAccountServer()
	recorder := httptest.NewRecorder()
	server.handleSetPreferences(recorder, signedIn(httptest.NewRequest(http.MethodPut, "/me/preferences",
		strings.NewReader(`{"preview_words": "   ", "license": "commercial-ok", "is_map_shown": false}`))))
	if recorder.Code != http.StatusOK || store.preferences.PreviewWords != defaultPreviewWords || store.preferences.IsMapShown {
		t.Errorf("got %d %+v, want 200 with default words and map hidden", recorder.Code, store.preferences)
	}

	recorder = httptest.NewRecorder()
	server.handleSetPreferences(recorder, signedIn(httptest.NewRequest(http.MethodPut, "/me/preferences",
		strings.NewReader(`{"preview_words": "Hi", "license": "anything"}`))))
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("unknown licence: got %d, want 400", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	long := strings.Repeat("a", maxPreviewWordsRunes+1)
	server.handleSetPreferences(recorder, signedIn(httptest.NewRequest(http.MethodPut, "/me/preferences",
		bytes.NewBufferString(`{"preview_words": "`+long+`"}`))))
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("long preview words: got %d, want 400", recorder.Code)
	}
}

func TestExportDownloadsEverythingKeptAsOneFile(t *testing.T) {
	server, _ := newAccountServer()
	recorder := httptest.NewRecorder()
	server.handleExport(recorder, signedIn(httptest.NewRequest(http.MethodGet, "/me/export", nil)))
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("got %d with disposition %q, want 200 attachment", recorder.Code, recorder.Header().Get("Content-Disposition"))
	}
	for _, field := range []string{`"user"`, `"saved"`, `"preferences"`, "ada@example.com"} {
		if !strings.Contains(recorder.Body.String(), field) {
			t.Errorf("export is missing %s", field)
		}
	}
}

func TestDeletingTheAccountRemovesTheUserAndSignsOut(t *testing.T) {
	server, store := newAccountServer()
	recorder := httptest.NewRecorder()
	server.handleDeleteAccount(recorder, signedIn(httptest.NewRequest(http.MethodDelete, "/me", nil)))
	if recorder.Code != http.StatusNoContent || store.deletedUserID != 7 {
		t.Errorf("got %d deleting user %d, want 204 deleting user 7", recorder.Code, store.deletedUserID)
	}
	if cookie := recorder.Header().Get("Set-Cookie"); !strings.Contains(cookie, "Max-Age=0") {
		t.Errorf("session cookie not cleared: %q", cookie)
	}
}
