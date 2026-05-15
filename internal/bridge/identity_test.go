package bridge

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrCreateIdentityPersistsEd25519Key(t *testing.T) {
	path := filepath.Join(t.TempDir(), "identity.pem")
	first, err := LoadOrCreateIdentity(path)
	if err != nil {
		t.Fatal(err)
	}
	if PublicKeyString(first.PublicKey) == "" {
		t.Fatal("public key string is empty")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("identity file mode: got %o want 0600", got)
	}
	second, err := LoadOrCreateIdentity(path)
	if err != nil {
		t.Fatal(err)
	}
	if PublicKeyString(second.PublicKey) != PublicKeyString(first.PublicKey) {
		t.Fatal("identity was not stable across loads")
	}
}
