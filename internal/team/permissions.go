package team

import (
	"encoding/json"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

const (
	permissionWorkspaceRead           = "workspace:read"
	permissionWorkspaceManage         = "workspace:manage"
	permissionMemberInvite            = "member:invite"
	permissionMemberManageRoles       = "member:manage_roles"
	permissionMemberManagePermissions = "member:manage_permissions"
	permissionProjectCreate           = "project:create"
	permissionProjectUpdate           = "project:update"
	permissionProjectArchive          = "project:archive"
	permissionTaskCreate              = "task:create"
	permissionTaskUpdate              = "task:update"
	permissionTaskAssign              = "task:assign"
	permissionTaskChangeStatus        = "task:change_status"
	permissionTaskExecuteAgent        = "task:execute_agent"
	permissionAgentCreate             = "agent:create"
	permissionAgentUpdate             = "agent:update"
	permissionAgentAssign             = "agent:assign"
	permissionSkillRead               = "skill:read"
	permissionSkillPropose            = "skill:propose"
	permissionSkillCreateActive       = "skill:create_active"
	permissionSkillApprove            = "skill:approve"
	permissionSkillUpdate             = "skill:update"
	permissionSkillArchive            = "skill:archive"
	permissionSkillInvoke             = "skill:invoke"
	permissionMemoryRead              = "memory:read"
	permissionMemoryWriteDraft        = "memory:write_draft"
	permissionMemoryPromote           = "memory:promote"
	permissionMemoryWriteCanonical    = "memory:write_canonical"
	permissionWikiRead                = "wiki:read"
	permissionModelUseLAF             = "model:use_laf"
	permissionMCPUseTaskContext       = "mcp:use_task_context"
	permissionMCPUseWorkspaceContext  = "mcp:use_workspace_context"
	permissionAuditRead               = "audit:read"
)

var workspacePermissions = []string{
	permissionWorkspaceRead,
	permissionWorkspaceManage,
	permissionMemberInvite,
	permissionMemberManageRoles,
	permissionMemberManagePermissions,
	permissionProjectCreate,
	permissionProjectUpdate,
	permissionProjectArchive,
	permissionTaskCreate,
	permissionTaskUpdate,
	permissionTaskAssign,
	permissionTaskChangeStatus,
	permissionTaskExecuteAgent,
	permissionAgentCreate,
	permissionAgentUpdate,
	permissionAgentAssign,
	permissionSkillRead,
	permissionSkillPropose,
	permissionSkillCreateActive,
	permissionSkillApprove,
	permissionSkillUpdate,
	permissionSkillArchive,
	permissionSkillInvoke,
	permissionMemoryRead,
	permissionMemoryWriteDraft,
	permissionMemoryPromote,
	permissionMemoryWriteCanonical,
	permissionWikiRead,
	permissionModelUseLAF,
	permissionMCPUseTaskContext,
	permissionMCPUseWorkspaceContext,
	permissionAuditRead,
}

var workspaceRoles = []string{"owner", "admin", "manager", "member", "viewer"}

type permissionOverride struct {
	Allow []string `json:"allow,omitempty"`
	Deny  []string `json:"deny,omitempty"`
}

type permissionMemberView struct {
	UserID               string             `json:"user_id"`
	Email                string             `json:"email"`
	Name                 string             `json:"name"`
	Role                 string             `json:"role"`
	Status               string             `json:"status"`
	Overrides            permissionOverride `json:"overrides"`
	EffectivePermissions []string           `json:"effective_permissions"`
}

func normalizePermission(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	for _, permission := range workspacePermissions {
		if raw == permission {
			return permission
		}
	}
	return ""
}

func normalizePermissionList(raw []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		permission := normalizePermission(item)
		if permission == "" {
			continue
		}
		if _, ok := seen[permission]; ok {
			continue
		}
		seen[permission] = struct{}{}
		out = append(out, permission)
	}
	sort.Strings(out)
	return out
}

func normalizePermissionOverride(raw permissionOverride) permissionOverride {
	return permissionOverride{
		Allow: normalizePermissionList(raw.Allow),
		Deny:  normalizePermissionList(raw.Deny),
	}
}

func allWorkspacePermissions() []string {
	out := append([]string(nil), workspacePermissions...)
	sort.Strings(out)
	return out
}

func rolePresetPermissions(role string) []string {
	switch normalizeAuthRole(role) {
	case "owner", "admin":
		return allWorkspacePermissions()
	case "manager":
		return []string{
			permissionWorkspaceRead,
			permissionMemberInvite,
			permissionProjectCreate,
			permissionProjectUpdate,
			permissionProjectArchive,
			permissionTaskCreate,
			permissionTaskUpdate,
			permissionTaskAssign,
			permissionTaskChangeStatus,
			permissionTaskExecuteAgent,
			permissionAgentAssign,
			permissionSkillRead,
			permissionSkillPropose,
			permissionSkillApprove,
			permissionSkillUpdate,
			permissionSkillInvoke,
			permissionMemoryRead,
			permissionMemoryWriteDraft,
			permissionMemoryPromote,
			permissionWikiRead,
			permissionModelUseLAF,
			permissionMCPUseTaskContext,
			permissionMCPUseWorkspaceContext,
		}
	case "member":
		return []string{
			permissionWorkspaceRead,
			permissionProjectCreate,
			permissionProjectUpdate,
			permissionTaskCreate,
			permissionTaskUpdate,
			permissionTaskChangeStatus,
			permissionTaskExecuteAgent,
			permissionSkillRead,
			permissionSkillPropose,
			permissionSkillInvoke,
			permissionMemoryRead,
			permissionMemoryWriteDraft,
			permissionWikiRead,
			permissionMCPUseTaskContext,
		}
	case "viewer":
		return []string{
			permissionWorkspaceRead,
			permissionSkillRead,
			permissionMemoryRead,
			permissionWikiRead,
		}
	default:
		return rolePresetPermissions("member")
	}
}

func effectivePermissions(role string, overrides permissionOverride) []string {
	if normalizeAuthRole(role) == "owner" {
		return allWorkspacePermissions()
	}
	set := map[string]struct{}{}
	for _, permission := range rolePresetPermissions(role) {
		set[permission] = struct{}{}
	}
	overrides = normalizePermissionOverride(overrides)
	for _, permission := range overrides.Allow {
		set[permission] = struct{}{}
	}
	for _, permission := range overrides.Deny {
		delete(set, permission)
	}
	out := make([]string, 0, len(set))
	for permission := range set {
		out = append(out, permission)
	}
	sort.Strings(out)
	return out
}

func authUserHasPermission(user *authUser, permission string) bool {
	if user == nil {
		return false
	}
	permission = normalizePermission(permission)
	if permission == "" {
		return false
	}
	for _, item := range effectivePermissions(user.Role, user.Permissions) {
		if item == permission {
			return true
		}
	}
	return false
}

func authUserIsWorkspaceAdmin(user *authUser) bool {
	if user == nil {
		return false
	}
	switch normalizeAuthRole(user.Role) {
	case "owner", "admin":
		return true
	default:
		return false
	}
}

func (b *Broker) requestUserHasPermissionLocked(r *http.Request, permission string) bool {
	user, _, _, ok := b.currentAuthUserLocked(r)
	if !ok {
		// Preserve local broker compatibility for bearer-token MCP/CLI calls
		// that predate browser sessions. Hosted API remains strict.
		return true
	}
	return authUserHasPermission(user, permission)
}

func (b *Broker) denyIfMissingPermissionLocked(w http.ResponseWriter, r *http.Request, permission string) bool {
	if b.requestUserHasPermissionLocked(r, permission) {
		return false
	}
	http.Error(w, "permission required: "+permission, http.StatusForbidden)
	return true
}

func (b *Broker) denyIfNonAdminLocked(w http.ResponseWriter, r *http.Request, message string) bool {
	user, _, _, ok := b.currentAuthUserLocked(r)
	if !ok {
		// Preserve local broker compatibility for pre-auth local CLI flows.
		return false
	}
	if authUserIsWorkspaceAdmin(user) {
		return false
	}
	http.Error(w, message, http.StatusForbidden)
	return true
}

func managedModelPaidFromEnv() bool {
	return envTruthy(product.Env("WORKSPACE_PAID")) ||
		envTruthy(product.Env("MANAGED_MODEL_ENABLED")) ||
		envTruthy("LAF_WORKSPACE_PAID") ||
		envTruthy("LAF_MANAGED_MODEL_ENABLED")
}

func (b *Broker) modelModeAvailableLocked(r *http.Request, mode string) (bool, string) {
	mode = normalizeModelMode(mode)
	user, _, _, _ := b.currentAuthUserLocked(r)
	switch mode {
	case "laf_model":
		if !managedModelPaidFromEnv() {
			return false, "workspace is not on a paid managed-model plan"
		}
		if user != nil && !authUserHasPermission(user, permissionModelUseLAF) {
			return false, "permission required: " + permissionModelUseLAF
		}
		return true, ""
	default:
		return true, ""
	}
}

func (b *Broker) denyIfModelModeUnavailableLocked(w http.ResponseWriter, r *http.Request, rawMode string) bool {
	mode := normalizeModelMode(rawMode)
	available, reason := b.modelModeAvailableLocked(r, mode)
	if available {
		return false
	}
	if reason == "" {
		reason = "model mode unavailable: " + mode
	}
	http.Error(w, reason, http.StatusForbidden)
	return true
}

func (b *Broker) appendAuditEventLocked(actor, action, targetType, targetID string, metadata map[string]any) {
	if metadata == nil {
		metadata = map[string]any{}
	}
	summary := strings.TrimSpace(action)
	if targetType != "" || targetID != "" {
		summary = strings.TrimSpace(action + " " + targetType + " " + targetID)
	}
	if encoded, err := json.Marshal(metadata); err == nil && string(encoded) != "{}" {
		summary = strings.TrimSpace(summary + " " + string(encoded))
	}
	b.appendActionLocked("audit_event", "governance", "general", strings.TrimSpace(actor), truncateSummary(summary, 180), strings.TrimSpace(targetID))
}

func (b *Broker) handlePermissions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		b.handleGetPermissions(w, r)
	case http.MethodPatch:
		b.handlePatchPermissions(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (b *Broker) handleGetPermissions(w http.ResponseWriter, r *http.Request) {
	b.mu.Lock()
	user, _, _, ok := b.currentAuthUserLocked(r)
	teamID := ""
	if ok && user != nil {
		teamID = user.TeamID
	} else if team := b.firstWorkspaceTeamLocked(); team != nil {
		teamID = team.ID
	}
	members := make([]permissionMemberView, 0, len(b.authUsers))
	for _, candidate := range b.authUsers {
		if teamID != "" && candidate.TeamID != teamID {
			continue
		}
		members = append(members, permissionMemberView{
			UserID:               candidate.ID,
			Email:                candidate.Email,
			Name:                 candidate.Name,
			Role:                 normalizeAuthRole(candidate.Role),
			Status:               candidate.Status,
			Overrides:            normalizePermissionOverride(candidate.Permissions),
			EffectivePermissions: effectivePermissions(candidate.Role, candidate.Permissions),
		})
	}
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"roles":       workspaceRoles,
		"permissions": allWorkspacePermissions(),
		"members":     members,
	})
}

func (b *Broker) handlePatchPermissions(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID      string              `json:"user_id"`
		Role        string              `json:"role"`
		Permissions *permissionOverride `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	nextRole := ""
	if strings.TrimSpace(body.Role) != "" {
		nextRole = normalizeAuthRole(body.Role)
		if nextRole == "" {
			http.Error(w, "role must be owner, admin, manager, member, or viewer", http.StatusBadRequest)
			return
		}
	}
	b.mu.Lock()
	requester, _, _, ok := b.currentAuthUserLocked(r)
	if !ok {
		b.mu.Unlock()
		http.Error(w, "auth session required", http.StatusUnauthorized)
		return
	}
	if !authUserHasPermission(requester, permissionMemberManagePermissions) {
		b.mu.Unlock()
		http.Error(w, "permission required: "+permissionMemberManagePermissions, http.StatusForbidden)
		return
	}
	target := b.findAuthUserByIDLocked(body.UserID)
	if target == nil || target.TeamID != requester.TeamID {
		b.mu.Unlock()
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	oldRole := target.Role
	if nextRole != "" {
		if normalizeAuthRole(target.Role) == "owner" && nextRole != "owner" && b.ownerCountForTeamLocked(target.TeamID) <= 1 {
			b.mu.Unlock()
			http.Error(w, "cannot remove the last owner", http.StatusConflict)
			return
		}
		target.Role = nextRole
	}
	if body.Permissions != nil {
		target.Permissions = normalizePermissionOverride(*body.Permissions)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	target.UpdatedAt = now
	for i := range b.humanMembers {
		if b.humanMembers[i].UserID == target.ID {
			b.humanMembers[i].Role = target.Role
		}
	}
	updated := permissionMemberView{
		UserID:               target.ID,
		Email:                target.Email,
		Name:                 target.Name,
		Role:                 normalizeAuthRole(target.Role),
		Status:               target.Status,
		Overrides:            normalizePermissionOverride(target.Permissions),
		EffectivePermissions: effectivePermissions(target.Role, target.Permissions),
	}
	b.appendAuditEventLocked(requester.ID, "permissions.updated", "user", target.ID, map[string]any{
		"old_role": oldRole,
		"new_role": target.Role,
	})
	if err := b.saveLocked(); err != nil {
		b.mu.Unlock()
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"member": updated})
}

type modelAvailabilityMode struct {
	Available bool     `json:"available"`
	Reason    string   `json:"reason,omitempty"`
	Runtimes  []string `json:"runtimes,omitempty"`
}

func (b *Broker) handleModelAvailability(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	b.mu.Lock()
	user, _, _, _ := b.currentAuthUserLocked(r)
	canUseLAF := user == nil || authUserHasPermission(user, permissionModelUseLAF)
	b.mu.Unlock()

	paid := managedModelPaidFromEnv()

	laf := modelAvailabilityMode{Available: paid && canUseLAF}
	if !paid {
		laf.Reason = "workspace is not on a paid managed-model plan"
	} else if !canUseLAF {
		laf.Reason = "permission required: " + permissionModelUseLAF
	}
	record := modelAvailabilityMode{Available: true, Reason: "records chat without agent execution"}

	defaultMode := "record_only"
	if laf.Available {
		defaultMode = "laf_model"
	}
	allowed := []string{"record_only"}
	if laf.Available {
		allowed = append([]string{"laf_model"}, allowed...)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"default_mode":  defaultMode,
		"allowed_modes": allowed,
		"laf_model":     laf,
		"record_only":   record,
		"reason":        "DB billing is used by hosted API; local broker uses environment fallback.",
	})
}

func envTruthy(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on", "paid", "enabled":
		return true
	default:
		return false
	}
}
