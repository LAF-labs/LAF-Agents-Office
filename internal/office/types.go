package office

type MessageReaction struct {
	Emoji string `json:"emoji"`
	From  string `json:"from"`
}

type MessageUsage struct {
	InputTokens         int `json:"input_tokens,omitempty"`
	OutputTokens        int `json:"output_tokens,omitempty"`
	CacheReadTokens     int `json:"cache_read_tokens,omitempty"`
	CacheCreationTokens int `json:"cache_creation_tokens,omitempty"`
	TotalTokens         int `json:"total_tokens,omitempty"`
}

type ChannelMessage struct {
	ID          string            `json:"id"`
	From        string            `json:"from"`
	Channel     string            `json:"channel,omitempty"`
	Kind        string            `json:"kind,omitempty"`
	Source      string            `json:"source,omitempty"`
	SourceLabel string            `json:"source_label,omitempty"`
	EventID     string            `json:"event_id,omitempty"`
	Title       string            `json:"title,omitempty"`
	Content     string            `json:"content"`
	Tagged      []string          `json:"tagged"`
	ReplyTo     string            `json:"reply_to,omitempty"`
	ProjectID   string            `json:"project_id,omitempty"`
	TaskID      string            `json:"task_id,omitempty"`
	Scope       string            `json:"scope,omitempty"`
	ModelMode   string            `json:"model_mode,omitempty"`
	Timestamp   string            `json:"timestamp"`
	Usage       *MessageUsage     `json:"usage,omitempty"`
	Reactions   []MessageReaction `json:"reactions,omitempty"`
}

type TeamTask struct {
	ID                     string   `json:"id"`
	ProjectID              string   `json:"project_id,omitempty"`
	Channel                string   `json:"channel,omitempty"`
	Title                  string   `json:"title"`
	Details                string   `json:"details,omitempty"`
	HumanDetails           string   `json:"human_details,omitempty"`
	Owner                  string   `json:"owner,omitempty"`
	AssigneeType           string   `json:"assignee_type,omitempty"`
	AssigneeID             string   `json:"assignee_id,omitempty"`
	HumanOwnerUserID       string   `json:"human_owner_user_id,omitempty"`
	ModelMode              string   `json:"model_mode,omitempty"`
	Status                 string   `json:"status"`
	CreatedBy              string   `json:"created_by"`
	ThreadID               string   `json:"thread_id,omitempty"`
	TaskType               string   `json:"task_type,omitempty"`
	PipelineID             string   `json:"pipeline_id,omitempty"`
	PipelineStage          string   `json:"pipeline_stage,omitempty"`
	ExecutionMode          string   `json:"execution_mode,omitempty"`
	ReviewState            string   `json:"review_state,omitempty"`
	SourceSignalID         string   `json:"source_signal_id,omitempty"`
	SourceDecisionID       string   `json:"source_decision_id,omitempty"`
	WorktreePath           string   `json:"worktree_path,omitempty"`
	WorktreeBranch         string   `json:"worktree_branch,omitempty"`
	DeliveryURL            string   `json:"delivery_url,omitempty"`
	DeliverySummary        string   `json:"delivery_summary,omitempty"`
	DeliveryStatus         string   `json:"delivery_status,omitempty"`
	DeliveryReviewDecision string   `json:"delivery_review_decision,omitempty"`
	DeliveryChecksStatus   string   `json:"delivery_checks_status,omitempty"`
	DeliveryMergeState     string   `json:"delivery_merge_state,omitempty"`
	DeliveryDraft          bool     `json:"delivery_draft,omitempty"`
	DeliveryCheckedAt      string   `json:"delivery_checked_at,omitempty"`
	DeliveredAt            string   `json:"delivered_at,omitempty"`
	DependsOn              []string `json:"depends_on,omitempty"`
	Blocked                bool     `json:"blocked,omitempty"`
	AckedAt                string   `json:"acked_at,omitempty"`
	DueAt                  string   `json:"due_at,omitempty"`
	FollowUpAt             string   `json:"follow_up_at,omitempty"`
	ReminderAt             string   `json:"reminder_at,omitempty"`
	RecheckAt              string   `json:"recheck_at,omitempty"`
	CreatedAt              string   `json:"created_at"`
	UpdatedAt              string   `json:"updated_at"`
}

type TeamProject struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Description     string `json:"description,omitempty"`
	AdditionalInfo  string `json:"additional_info,omitempty"`
	Channel         string `json:"channel,omitempty"`
	LeadAgent       string `json:"lead_agent,omitempty"`
	GitHubRepoURL   string `json:"github_repo_url,omitempty"`
	RecipeFileName  string `json:"recipe_filename,omitempty"`
	RecipeMarkdown  string `json:"recipe_markdown,omitempty"`
	RecipeUpdatedAt string `json:"recipe_updated_at,omitempty"`
	Status          string `json:"status,omitempty"`
	CreatedBy       string `json:"created_by,omitempty"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

type ActionLog struct {
	ID         string   `json:"id"`
	Kind       string   `json:"kind"`
	Source     string   `json:"source,omitempty"`
	Channel    string   `json:"channel,omitempty"`
	Actor      string   `json:"actor,omitempty"`
	Summary    string   `json:"summary"`
	RelatedID  string   `json:"related_id,omitempty"`
	SignalIDs  []string `json:"signal_ids,omitempty"`
	DecisionID string   `json:"decision_id,omitempty"`
	CreatedAt  string   `json:"created_at"`
}

type AgentActivitySnapshot struct {
	Slug         string `json:"slug"`
	Status       string `json:"status,omitempty"`
	Activity     string `json:"activity,omitempty"`
	Detail       string `json:"detail,omitempty"`
	LastTime     string `json:"lastTime,omitempty"`
	TotalMs      int64  `json:"totalMs,omitempty"`
	FirstEventMs int64  `json:"firstEventMs,omitempty"`
	FirstTextMs  int64  `json:"firstTextMs,omitempty"`
	FirstToolMs  int64  `json:"firstToolMs,omitempty"`
}

type SignalRecord struct {
	ID            string `json:"id"`
	Source        string `json:"source"`
	SourceRef     string `json:"source_ref,omitempty"`
	Kind          string `json:"kind,omitempty"`
	Title         string `json:"title,omitempty"`
	Content       string `json:"content"`
	Channel       string `json:"channel,omitempty"`
	Owner         string `json:"owner,omitempty"`
	Confidence    string `json:"confidence,omitempty"`
	Urgency       string `json:"urgency,omitempty"`
	DedupeKey     string `json:"dedupe_key,omitempty"`
	RequiresHuman bool   `json:"requires_human,omitempty"`
	Blocking      bool   `json:"blocking,omitempty"`
	CreatedAt     string `json:"created_at"`
}

type DecisionRecord struct {
	ID            string   `json:"id"`
	Kind          string   `json:"kind"`
	Channel       string   `json:"channel,omitempty"`
	Summary       string   `json:"summary"`
	Reason        string   `json:"reason,omitempty"`
	Owner         string   `json:"owner,omitempty"`
	SignalIDs     []string `json:"signal_ids,omitempty"`
	RequiresHuman bool     `json:"requires_human,omitempty"`
	Blocking      bool     `json:"blocking,omitempty"`
	CreatedAt     string   `json:"created_at"`
}
