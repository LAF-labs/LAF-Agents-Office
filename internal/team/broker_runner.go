package team

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"
)

func (b *Broker) handleRunnerStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	b.mu.Lock()
	if b.denyIfMissingPermissionLocked(w, r, permissionRunnerRead) {
		b.mu.Unlock()
		return
	}
	b.mu.Unlock()
	taskID := strings.TrimSpace(r.URL.Query().Get("task_id"))
	projectID := normalizeProjectID(r.URL.Query().Get("project_id"))
	now := time.Now().UTC()

	b.mu.Lock()
	b.requeueExpiredRunnerJobsLocked(now)
	runners := make([]hostedRunner, 0, len(b.runners))
	for _, runner := range b.runners {
		r := publicHostedRunner(runner)
		if r.Status == runnerStatusConnected && runnerLooksStale(r.LastSeenAt, now) {
			r.Status = runnerStatusStale
		}
		runners = append(runners, r)
	}
	jobs := make([]runnerJob, 0, len(b.runnerJobs))
	for _, job := range b.runnerJobs {
		if taskID != "" && strings.TrimSpace(job.TaskID) != taskID {
			continue
		}
		if projectID != "" && normalizeProjectID(job.ProjectID) != projectID {
			continue
		}
		jobs = append(jobs, job)
	}
	sort.SliceStable(jobs, func(i, j int) bool {
		return strings.TrimSpace(jobs[i].CreatedAt) > strings.TrimSpace(jobs[j].CreatedAt)
	})
	b.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"runners": runners,
		"jobs":    jobs,
	})
}

func (b *Broker) handleRunnerPairingStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	b.mu.Lock()
	if b.denyIfMissingPermissionLocked(w, r, permissionRunnerManage) {
		b.mu.Unlock()
		return
	}
	if b.denyIfNonAdminLocked(w, r, "team bridge registration requires admin") {
		b.mu.Unlock()
		return
	}
	b.mu.Unlock()
	var body struct {
		APIURL string `json:"api_url"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	now := time.Now().UTC()
	expiresAt := now.Add(10 * time.Minute)
	teamID := ""
	createdBy := ""

	b.mu.Lock()
	if user, team, _, ok := b.currentAuthUserLocked(r); ok && user != nil {
		teamID = strings.TrimSpace(user.TeamID)
		createdBy = strings.TrimSpace(user.ID)
		if teamID == "" && team != nil {
			teamID = team.ID
		}
	}
	if teamID == "" {
		if team := b.firstWorkspaceTeamLocked(); team != nil {
			teamID = team.ID
		}
	}
	if teamID == "" {
		b.mu.Unlock()
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "team_id is required"})
		return
	}
	code := generateRunnerPairingCode()
	pairing := runnerPairingCode{
		ID:        "runner-pairing-" + generateToken(),
		TeamID:    teamID,
		CodeHash:  hashRunnerToken(normalizeRunnerPairingCode(code)),
		Status:    "pending",
		CreatedBy: createdBy,
		CreatedAt: now.Format(time.RFC3339),
		ExpiresAt: expiresAt.Format(time.RFC3339),
	}
	b.pruneRunnerPairingCodesLocked(now)
	b.runnerPairingCodes = append(b.runnerPairingCodes, pairing)
	b.mu.Unlock()

	apiURL := normalizeRunnerPairingAPIURL(body.APIURL)
	if apiURL == "" {
		apiURL = runnerPairingRequestAPIURL(r)
	}
	writeJSON(w, http.StatusOK, runnerPairingStartResponse(apiURL, code, teamID, pairing.ExpiresAt))
}

func (b *Broker) handleRunnerPairingClaim(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Code         string             `json:"code"`
		PairingCode  string             `json:"pairing_code"`
		Name         string             `json:"name"`
		RunnerType   string             `json:"runner_type"`
		Capabilities runnerCapabilities `json:"capabilities"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	code := normalizeRunnerPairingCode(firstNonEmptyString(body.Code, body.PairingCode))
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "pairing code is required"})
		return
	}
	now := time.Now().UTC()
	nowText := now.Format(time.RFC3339)
	token := "lafr_" + generateToken() + generateToken()
	runner := hostedRunner{
		ID:           "runner-" + generateToken(),
		Name:         strings.TrimSpace(body.Name),
		RunnerType:   normalizeRunnerType(body.RunnerType),
		Status:       runnerStatusConnected,
		TokenHash:    hashRunnerToken(token),
		Capabilities: normalizeRunnerCapabilities(body.Capabilities),
		CreatedAt:    nowText,
		UpdatedAt:    nowText,
		LastSeenAt:   nowText,
	}
	if runner.Name == "" {
		runner.Name = "Local runner"
	}

	b.mu.Lock()
	b.pruneRunnerPairingCodesLocked(now)
	idx := -1
	codeHash := hashRunnerToken(code)
	for i := range b.runnerPairingCodes {
		pairing := b.runnerPairingCodes[i]
		if pairing.Status == "pending" && pairing.CodeHash == codeHash {
			idx = i
			break
		}
	}
	if idx < 0 {
		b.mu.Unlock()
		writeJSON(w, http.StatusGone, map[string]string{"error": "pairing code expired or already used"})
		return
	}
	runner.TeamID = b.runnerPairingCodes[idx].TeamID
	b.runnerPairingCodes = append(b.runnerPairingCodes[:idx], b.runnerPairingCodes[idx+1:]...)
	b.runners = append(b.runners, runner)
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist runner"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"runner":       publicHostedRunner(runner),
		"runner_token": token,
	})
}

func (b *Broker) handleRunnerRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	b.mu.Lock()
	if b.denyIfMissingPermissionLocked(w, r, permissionRunnerManage) {
		b.mu.Unlock()
		return
	}
	if b.denyIfNonAdminLocked(w, r, "team bridge registration requires admin") {
		b.mu.Unlock()
		return
	}
	b.mu.Unlock()
	var body struct {
		TeamID       string             `json:"team_id"`
		Name         string             `json:"name"`
		RunnerType   string             `json:"runner_type"`
		Capabilities runnerCapabilities `json:"capabilities"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	token := "lafr_" + generateToken() + generateToken()
	runner := hostedRunner{
		ID:           "runner-" + generateToken(),
		TeamID:       strings.TrimSpace(body.TeamID),
		Name:         strings.TrimSpace(body.Name),
		RunnerType:   normalizeRunnerType(body.RunnerType),
		Status:       runnerStatusConnected,
		TokenHash:    hashRunnerToken(token),
		Capabilities: normalizeRunnerCapabilities(body.Capabilities),
		CreatedAt:    now,
		UpdatedAt:    now,
		LastSeenAt:   now,
	}
	if runner.Name == "" {
		runner.Name = "Local runner"
	}

	b.mu.Lock()
	if runner.TeamID == "" {
		if user, team, _, ok := b.currentAuthUserLocked(r); ok && user != nil {
			runner.TeamID = strings.TrimSpace(user.TeamID)
			if runner.TeamID == "" && team != nil {
				runner.TeamID = team.ID
			}
		}
	}
	if runner.TeamID == "" {
		if team := b.firstWorkspaceTeamLocked(); team != nil {
			runner.TeamID = team.ID
		}
	}
	if runner.TeamID == "" {
		b.mu.Unlock()
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "team_id is required"})
		return
	}
	if len(b.workspaceTeams) > 0 && b.findWorkspaceTeamLocked(runner.TeamID) == nil {
		b.mu.Unlock()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "team not found"})
		return
	}
	b.runners = append(b.runners, runner)
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist runner"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"runner":       publicHostedRunner(runner),
		"runner_token": token,
	})
}

func (b *Broker) handleRunnerRevoke(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	b.mu.Lock()
	if b.denyIfMissingPermissionLocked(w, r, permissionRunnerManage) {
		b.mu.Unlock()
		return
	}
	b.mu.Unlock()
	var body struct {
		RunnerID string `json:"runner_id"`
		ID       string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	runnerID := strings.TrimSpace(firstNonEmptyString(body.RunnerID, body.ID))
	if runnerID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "runner_id is required"})
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	teamID := ""

	b.mu.Lock()
	if user, team, _, ok := b.currentAuthUserLocked(r); ok && user != nil {
		teamID = strings.TrimSpace(user.TeamID)
		if teamID == "" && team != nil {
			teamID = team.ID
		}
	}
	if teamID == "" {
		if team := b.firstWorkspaceTeamLocked(); team != nil {
			teamID = team.ID
		}
	}

	idx := -1
	for i := range b.runners {
		if b.runners[i].ID != runnerID {
			continue
		}
		if teamID != "" && b.runners[i].TeamID != teamID {
			continue
		}
		idx = i
		break
	}
	if idx < 0 {
		b.mu.Unlock()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "runner not found"})
		return
	}

	b.runners[idx].Status = runnerStatusRevoked
	b.runners[idx].RevokedAt = now
	b.runners[idx].UpdatedAt = now
	for i := range b.runnerJobs {
		job := &b.runnerJobs[i]
		if job.RunnerID != runnerID {
			continue
		}
		if job.Status != runnerJobStatusLeased && job.Status != runnerJobStatusRunning {
			continue
		}
		job.RunnerID = ""
		job.Status = runnerJobStatusExpired
		job.LeaseExpiresAt = ""
		job.LastError = "runner revoked"
		job.UpdatedAt = now
	}
	response := publicHostedRunner(b.runners[idx])
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist runner revocation"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runner": response})
}

func (b *Broker) pruneRunnerPairingCodesLocked(now time.Time) {
	kept := b.runnerPairingCodes[:0]
	for _, pairing := range b.runnerPairingCodes {
		expiresAt, err := time.Parse(time.RFC3339, strings.TrimSpace(pairing.ExpiresAt))
		if err == nil && now.UTC().After(expiresAt.UTC()) {
			continue
		}
		if pairing.Status != "pending" {
			continue
		}
		kept = append(kept, pairing)
	}
	b.runnerPairingCodes = kept
}

func generateRunnerPairingCode() string {
	raw := strings.ToUpper(generateToken())
	if len(raw) < 12 {
		return raw
	}
	return raw[:4] + "-" + raw[4:8] + "-" + raw[8:12]
}

func normalizeRunnerPairingCode(raw string) string {
	raw = strings.ToUpper(strings.TrimSpace(raw))
	var b strings.Builder
	for _, r := range raw {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func normalizeRunnerPairingAPIURL(raw string) string {
	return strings.TrimRight(strings.TrimSpace(raw), "/")
}

func runnerPairingRequestAPIURL(r *http.Request) string {
	proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if proto == "" {
		proto = "http"
	}
	host := strings.TrimSpace(r.Host)
	if host == "" {
		return ""
	}
	return proto + "://" + host + "/api"
}

func runnerPairingStartResponse(apiURL, code, teamID, expiresAt string) map[string]any {
	apiURL = strings.TrimRight(strings.TrimSpace(apiURL), "/")
	return map[string]any{
		"api_url": apiURL,
		"pairing": map[string]string{
			"code":       code,
			"team_id":    teamID,
			"expires_at": expiresAt,
		},
		"commands": runnerPairingCommands(apiURL, code),
	}
}

func runnerPairingCommands(apiURL, code string) map[string]string {
	apiURL = strings.TrimRight(strings.TrimSpace(apiURL), "/")
	return map[string]string{
		"connect": "laf-runner pair --api-url " + apiURL + " --code " + code + " --connect",
	}
}

func runnerLooksStale(lastSeenAt string, now time.Time) bool {
	lastSeenAt = strings.TrimSpace(lastSeenAt)
	if lastSeenAt == "" {
		return true
	}
	seenAt, err := time.Parse(time.RFC3339, lastSeenAt)
	if err != nil {
		return true
	}
	return now.UTC().Sub(seenAt.UTC()) > 2*defaultRunnerLeaseDuration
}

func (b *Broker) handleRunnerHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	now := time.Now().UTC().Format(time.RFC3339)

	b.mu.Lock()
	runner, ok := b.runnerForRequestLocked(r)
	if !ok {
		b.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "runner unauthorized"})
		return
	}
	runner.Status = normalizeRunnerStatus(body.Status)
	if runner.Status == runnerStatusRevoked {
		runner.Status = runnerStatusConnected
	}
	runner.LastSeenAt = now
	runner.UpdatedAt = now
	response := publicHostedRunner(*runner)
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist heartbeat"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"runner":      response,
		"server_time": now,
	})
}

func (b *Broker) handleRunnerCapabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Capabilities runnerCapabilities `json:"capabilities"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)

	b.mu.Lock()
	runner, ok := b.runnerForRequestLocked(r)
	if !ok {
		b.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "runner unauthorized"})
		return
	}
	runner.Capabilities = normalizeRunnerCapabilities(body.Capabilities)
	runner.Status = runnerStatusConnected
	runner.LastSeenAt = now
	runner.UpdatedAt = now
	response := publicHostedRunner(*runner)
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist capabilities"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runner": response})
}

func (b *Broker) handleRunnerJobsLease(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		LeaseSeconds int `json:"lease_seconds"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	leaseDuration := defaultRunnerLeaseDuration
	if body.LeaseSeconds > 0 {
		leaseDuration = time.Duration(body.LeaseSeconds) * time.Second
	}
	if leaseDuration < time.Minute {
		leaseDuration = time.Minute
	}
	if leaseDuration > 30*time.Minute {
		leaseDuration = 30 * time.Minute
	}

	now := time.Now().UTC()
	nowText := now.Format(time.RFC3339)
	leaseExpiresAt := now.Add(leaseDuration).Format(time.RFC3339)

	b.mu.Lock()
	runner, ok := b.runnerForRequestLocked(r)
	if !ok {
		b.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "runner unauthorized"})
		return
	}
	b.requeueExpiredRunnerJobsLocked(now)
	runner.Status = runnerStatusConnected
	runner.LastSeenAt = nowText
	runner.UpdatedAt = nowText

	var leased *runnerJob
	for i := range b.runnerJobs {
		if !runnerCanClaimJob(*runner, b.runnerJobs[i]) {
			continue
		}
		job := &b.runnerJobs[i]
		job.Status = runnerJobStatusLeased
		job.RunnerID = runner.ID
		job.LeaseExpiresAt = leaseExpiresAt
		job.Attempts++
		job.UpdatedAt = nowText
		b.appendRunnerJobEventLocked(*job, runner.ID, runnerJobStatusLeased, "info", "job leased to runner", nil, nowText)
		leased = job
		break
	}
	var responseJob *runnerJob
	if leased != nil {
		copy := *leased
		responseJob = &copy
	}
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist lease"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"job": responseJob})
}

func (b *Broker) handleRunnerJobSubpath(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/runner/jobs/"), "/")
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "runner job route not found"})
		return
	}
	switch parts[1] {
	case "events":
		b.handleRunnerJobEvent(w, r, parts[0])
	case "complete":
		b.handleRunnerJobComplete(w, r, parts[0])
	case "renew":
		b.handleRunnerJobRenew(w, r, parts[0])
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "runner job route not found"})
	}
}

func (b *Broker) handleRunnerJobEvent(w http.ResponseWriter, r *http.Request, jobID string) {
	var body struct {
		Kind    string         `json:"kind"`
		Level   string         `json:"level"`
		Message string         `json:"message"`
		Status  string         `json:"status"`
		Payload map[string]any `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	nowTime := time.Now().UTC()
	now := nowTime.Format(time.RFC3339)

	b.mu.Lock()
	runner, job, ok := b.runnerAndJobForRequestLocked(r, jobID)
	if !ok {
		b.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "runner unauthorized"})
		return
	}
	if msg := runnerActiveJobOwnershipError(*runner, *job, nowTime); msg != "" {
		b.mu.Unlock()
		writeJSON(w, http.StatusConflict, map[string]string{"error": msg})
		return
	}
	if status := normalizeRunnerJobStatus(body.Status); status == runnerJobStatusRunning || strings.EqualFold(strings.TrimSpace(body.Kind), runnerJobStatusRunning) {
		job.Status = runnerJobStatusRunning
		if strings.TrimSpace(job.StartedAt) == "" {
			job.StartedAt = now
		}
		job.UpdatedAt = now
	}
	event := b.appendRunnerJobEventLocked(*job, runner.ID, body.Kind, body.Level, body.Message, body.Payload, now)
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist event"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": event})
}

func (b *Broker) handleRunnerJobComplete(w http.ResponseWriter, r *http.Request, jobID string) {
	var body struct {
		Status                 string         `json:"status"`
		Message                string         `json:"message"`
		Error                  string         `json:"error"`
		DeliveryURL            string         `json:"delivery_url"`
		DeliverySummary        string         `json:"delivery_summary"`
		DeliveryStatus         string         `json:"delivery_status"`
		DeliveryReviewDecision string         `json:"delivery_review_decision"`
		DeliveryChecksStatus   string         `json:"delivery_checks_status"`
		DeliveryMergeState     string         `json:"delivery_merge_state"`
		DeliveryDraft          bool           `json:"delivery_draft"`
		DeliveryCheckedAt      string         `json:"delivery_checked_at"`
		WorktreePath           string         `json:"worktree_path"`
		WorktreeBranch         string         `json:"worktree_branch"`
		Payload                map[string]any `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	status := normalizeRunnerJobStatus(body.Status)
	if status != runnerJobStatusSucceeded && status != runnerJobStatusFailed && status != runnerJobStatusCanceled {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "status must be succeeded, failed, or canceled"})
		return
	}
	nowTime := time.Now().UTC()
	now := nowTime.Format(time.RFC3339)

	b.mu.Lock()
	runner, job, ok := b.runnerAndJobForRequestLocked(r, jobID)
	if !ok {
		b.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "runner unauthorized"})
		return
	}
	if msg := runnerActiveJobOwnershipError(*runner, *job, nowTime); msg != "" {
		b.mu.Unlock()
		writeJSON(w, http.StatusConflict, map[string]string{"error": msg})
		return
	}
	job.Status = status
	job.RunnerID = runner.ID
	job.CompletedAt = now
	job.UpdatedAt = now
	job.LeaseExpiresAt = ""
	if strings.TrimSpace(body.Error) != "" {
		job.LastError = strings.TrimSpace(body.Error)
	}
	message := body.Message
	if strings.TrimSpace(message) == "" {
		message = body.Error
	}
	event := b.appendRunnerJobEventLocked(*job, runner.ID, status, completionEventLevel(status), message, body.Payload, now)
	var taskCopy *teamTask
	if task := b.findTaskLocked(job.TaskID); task != nil {
		if worktreePath := strings.TrimSpace(body.WorktreePath); worktreePath != "" {
			task.WorktreePath = worktreePath
		}
		if worktreeBranch := strings.TrimSpace(body.WorktreeBranch); worktreeBranch != "" {
			task.WorktreeBranch = worktreeBranch
		}
		applyTaskDeliveryReceipt(task, body.DeliveryURL, body.DeliverySummary, now)
		applyTaskDeliveryVerification(task, projectTaskDeliveryVerification{
			Status:         body.DeliveryStatus,
			ReviewDecision: body.DeliveryReviewDecision,
			ChecksStatus:   body.DeliveryChecksStatus,
			MergeState:     body.DeliveryMergeState,
			CheckedAt:      body.DeliveryCheckedAt,
			Draft:          body.DeliveryDraft,
		})
		task.UpdatedAt = now
		copy := *task
		taskCopy = &copy
	}
	jobCopy := *job
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist completion"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"job":   jobCopy,
		"event": event,
		"task":  taskCopy,
	})
}

func (b *Broker) handleRunnerJobRenew(w http.ResponseWriter, r *http.Request, jobID string) {
	var body struct {
		LeaseSeconds int `json:"lease_seconds"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	leaseDuration := defaultRunnerLeaseDuration
	if body.LeaseSeconds > 0 {
		leaseDuration = time.Duration(body.LeaseSeconds) * time.Second
	}
	if leaseDuration < time.Minute {
		leaseDuration = time.Minute
	}
	if leaseDuration > 30*time.Minute {
		leaseDuration = 30 * time.Minute
	}
	nowTime := time.Now().UTC()
	now := nowTime.Format(time.RFC3339)
	leaseExpiresAt := nowTime.Add(leaseDuration).Format(time.RFC3339)

	b.mu.Lock()
	runner, job, ok := b.runnerAndJobForRequestLocked(r, jobID)
	if !ok {
		b.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "runner unauthorized"})
		return
	}
	if msg := runnerActiveJobOwnershipError(*runner, *job, nowTime); msg != "" {
		b.mu.Unlock()
		writeJSON(w, http.StatusConflict, map[string]string{"error": msg})
		return
	}
	job.LeaseExpiresAt = leaseExpiresAt
	job.UpdatedAt = now
	event := b.appendRunnerJobEventLocked(*job, runner.ID, "renewed", "info", "runner renewed job lease", map[string]any{"lease_seconds": int(leaseDuration.Seconds())}, now)
	jobCopy := *job
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist renewal"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"job": jobCopy, "event": event})
}

func (b *Broker) handleRunnerWikiWriteResult(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RequestID     string   `json:"request_id"`
		TeamID        string   `json:"team_id"`
		ProjectID     string   `json:"project_id"`
		ArticlePath   string   `json:"article_path"`
		Title         string   `json:"title"`
		Status        string   `json:"status"`
		CommitSHA     string   `json:"commit_sha"`
		Excerpt       string   `json:"excerpt"`
		Decisions     []string `json:"decisions"`
		Risks         []string `json:"risks"`
		OpenQuestions []string `json:"open_questions"`
		Error         string   `json:"error"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	articlePath := strings.Trim(strings.TrimSpace(body.ArticlePath), "/")
	if articlePath == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "article_path is required"})
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)

	b.mu.Lock()
	runner, ok := b.runnerForRequestLocked(r)
	if !ok {
		b.mu.Unlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "runner unauthorized"})
		return
	}
	teamID := strings.TrimSpace(body.TeamID)
	if teamID == "" {
		teamID = runner.TeamID
	}
	if teamID != runner.TeamID {
		b.mu.Unlock()
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "runner cannot write results for another team"})
		return
	}
	projectID := normalizeProjectID(body.ProjectID)
	status := strings.TrimSpace(body.Status)
	if status == "" {
		status = runnerJobStatusSucceeded
	}
	if requestID := strings.TrimSpace(body.RequestID); requestID != "" {
		updated := false
		for i := range b.wikiWriteRequests {
			req := &b.wikiWriteRequests[i]
			if req.ID != requestID || req.TeamID != teamID {
				continue
			}
			req.ProjectID = projectID
			req.ArticlePath = articlePath
			req.Status = status
			req.RunnerID = runner.ID
			req.CommitSHA = strings.TrimSpace(body.CommitSHA)
			req.Error = strings.TrimSpace(body.Error)
			req.UpdatedAt = now
			req.CompletedAt = now
			updated = true
			break
		}
		if !updated {
			b.wikiWriteRequests = append(b.wikiWriteRequests, hostedWikiWriteRequest{
				ID:          requestID,
				TeamID:      teamID,
				ProjectID:   projectID,
				ArticlePath: articlePath,
				Status:      status,
				RunnerID:    runner.ID,
				CommitSHA:   strings.TrimSpace(body.CommitSHA),
				Error:       strings.TrimSpace(body.Error),
				CreatedAt:   now,
				UpdatedAt:   now,
				CompletedAt: now,
			})
		}
	}
	index := hostedWikiArticleIndex{
		ID:            "wiki-index-" + generateToken(),
		TeamID:        teamID,
		ProjectID:     projectID,
		ArticlePath:   articlePath,
		Title:         strings.TrimSpace(body.Title),
		LastCommit:    strings.TrimSpace(body.CommitSHA),
		Excerpt:       strings.TrimSpace(body.Excerpt),
		Decisions:     normalizeStringList(body.Decisions),
		Risks:         normalizeStringList(body.Risks),
		OpenQuestions: normalizeStringList(body.OpenQuestions),
		UpdatedAt:     now,
	}
	for i := range b.wikiArticleIndex {
		if b.wikiArticleIndex[i].TeamID == teamID && b.wikiArticleIndex[i].ProjectID == projectID && b.wikiArticleIndex[i].ArticlePath == articlePath {
			index.ID = b.wikiArticleIndex[i].ID
			b.wikiArticleIndex[i] = index
			index = b.wikiArticleIndex[i]
			goto savedIndex
		}
	}
	b.wikiArticleIndex = append(b.wikiArticleIndex, index)
savedIndex:
	err := b.saveLocked()
	b.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist wiki write result"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"article": index})
}

func runnerActiveJobOwnershipError(runner hostedRunner, job runnerJob, now time.Time) string {
	if strings.TrimSpace(job.RunnerID) == "" || strings.TrimSpace(job.RunnerID) != strings.TrimSpace(runner.ID) {
		return "job is not leased by this runner"
	}
	switch normalizeRunnerJobStatus(job.Status) {
	case runnerJobStatusLeased, runnerJobStatusRunning:
	default:
		return "job is not active"
	}
	if runnerLeaseExpired(job.LeaseExpiresAt, now) {
		return "job lease expired"
	}
	return ""
}

func completionEventLevel(status string) string {
	switch status {
	case runnerJobStatusSucceeded:
		return "info"
	case runnerJobStatusCanceled:
		return "warn"
	default:
		return "error"
	}
}

func runnerTokenFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}
	if token := strings.TrimSpace(r.Header.Get("X-LAF-Runner-Token")); token != "" {
		return token
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[len("Bearer "):])
	}
	return ""
}

func (b *Broker) runnerForRequestLocked(r *http.Request) (*hostedRunner, bool) {
	return b.findRunnerByTokenLocked(runnerTokenFromRequest(r))
}

func (b *Broker) runnerAndJobForRequestLocked(r *http.Request, jobID string) (*hostedRunner, *runnerJob, bool) {
	runner, ok := b.runnerForRequestLocked(r)
	if !ok {
		return nil, nil, false
	}
	job := b.findRunnerJobLocked(jobID)
	if job == nil || job.TeamID != runner.TeamID {
		return nil, nil, false
	}
	return runner, job, true
}
