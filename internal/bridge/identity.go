package bridge

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type Identity struct {
	Path       string
	PrivateKey ed25519.PrivateKey
	PublicKey  ed25519.PublicKey
}

func LoadOrCreateIdentity(path string) (Identity, error) {
	if strings.TrimSpace(path) == "" {
		path = IdentityPath()
	}
	if identity, err := LoadIdentity(path); err == nil {
		return identity, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return Identity{}, err
	}
	_, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		return Identity{}, err
	}
	if err := SaveIdentity(path, priv); err != nil {
		return Identity{}, err
	}
	return Identity{Path: path, PrivateKey: priv, PublicKey: priv.Public().(ed25519.PublicKey)}, nil
}

func LoadIdentity(path string) (Identity, error) {
	if strings.TrimSpace(path) == "" {
		path = IdentityPath()
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Identity{}, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return Identity{}, errors.New("bridge identity is not PEM encoded")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return Identity{}, err
	}
	privateKey, ok := key.(ed25519.PrivateKey)
	if !ok {
		return Identity{}, errors.New("bridge identity is not Ed25519")
	}
	return Identity{
		Path:       path,
		PrivateKey: privateKey,
		PublicKey:  privateKey.Public().(ed25519.PublicKey),
	}, nil
}

func SaveIdentity(path string, privateKey ed25519.PrivateKey) error {
	if strings.TrimSpace(path) == "" {
		path = IdentityPath()
	}
	if len(privateKey) != ed25519.PrivateKeySize {
		return errors.New("invalid Ed25519 private key")
	}
	der, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: der,
	}), 0o600)
}

func PublicKeyString(publicKey ed25519.PublicKey) string {
	return base64.StdEncoding.EncodeToString(publicKey)
}
