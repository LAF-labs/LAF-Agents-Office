package team

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestAtomicReplaceFileReplacesExistingDestination(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "state.json")
	if err := os.WriteFile(dest, []byte("old"), 0o600); err != nil {
		t.Fatalf("write dest: %v", err)
	}
	tmp := filepath.Join(dir, "state.json.tmp")
	if err := os.WriteFile(tmp, []byte("new"), 0o600); err != nil {
		t.Fatalf("write tmp: %v", err)
	}

	if err := atomicReplaceFile(tmp, dest); err != nil {
		t.Fatalf("replace: %v", err)
	}
	raw, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("read dest: %v", err)
	}
	if string(raw) != "new" {
		t.Fatalf("expected replaced content, got %q", string(raw))
	}
	if _, err := os.Stat(tmp); !os.IsNotExist(err) {
		t.Fatalf("tmp should be gone after replace, err=%v", err)
	}
}

func TestAtomicWriteFileSerializesOnlyMatchingDestinations(t *testing.T) {
	dir := t.TempDir()
	paths := []string{filepath.Join(dir, "a.json"), filepath.Join(dir, "b.json")}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		for _, path := range paths {
			wg.Add(1)
			go func(path string, i int) {
				defer wg.Done()
				if err := atomicWriteFile(path, []byte{byte('a' + i%26)}); err != nil {
					t.Errorf("atomicWriteFile(%s): %v", path, err)
				}
			}(path, i)
		}
	}
	wg.Wait()

	for _, path := range paths {
		if raw, err := os.ReadFile(path); err != nil {
			t.Fatalf("read %s: %v", path, err)
		} else if len(raw) != 1 {
			t.Fatalf("expected complete one-byte write for %s, got %q", path, raw)
		}
	}
}
