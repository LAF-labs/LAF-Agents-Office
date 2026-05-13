//go:build windows

package team

import (
	"os"
	"syscall"
	"unsafe"
)

const (
	moveFileReplaceExisting = 0x1
	moveFileWriteThrough    = 0x8
)

var moveFileExProc = syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW")

func atomicReplaceFile(tmpName string, path string) error {
	oldPath, err := syscall.UTF16PtrFromString(tmpName)
	if err != nil {
		return err
	}
	newPath, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	r1, _, callErr := moveFileExProc.Call(
		uintptr(unsafe.Pointer(oldPath)),
		uintptr(unsafe.Pointer(newPath)),
		uintptr(moveFileReplaceExisting|moveFileWriteThrough),
	)
	if r1 != 0 {
		return nil
	}
	if callErr == syscall.Errno(0) {
		callErr = syscall.EINVAL
	}
	return &os.LinkError{Op: "rename", Old: tmpName, New: path, Err: callErr}
}
