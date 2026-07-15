// ──────────────────────────────────────────────────────────────────
// File:    ChatSession.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; adjusted require paths
// ──────────────────────────────────────────────────────────────────
const WorkflowResult = require("./WorkflowResult");
const paths = require("../access/env/paths");
const FsProjectRepository = require("../access/fs/FsProjectRepository.repository");

class ChatSessionWorkflow {

    static MANIFEST = {
        id:           "ChatSessionWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["chat-session:list", "chat-session:create", "chat-session:rename", "chat-session:delete", "chat-session:load", "chat-session:append"],
        dependencies: ["FsProjectRepository.repository"],
        docs: {
            description: "Manages per-project chat session CRUD (list, create, rename, delete, load, append) via FsProjectRepository, auto-migrating legacy history.json into a default session when needed.",
            author: "ProtoAI team",
        },
        last_modified: "2026-07-13T00:00:00Z",
        actions: {
            commands:  {},
            triggers:  {},
            emits:     {},
            workflows: {},
        },
    };
      constructor() {
    this.projectRepo = new FsProjectRepository();
  }

  async run(context) {
    const { action, project, chatId, name, entry } = context;
    try {
      switch (action) {
        case "list": {
          const sessions = this.projectRepo.listChatSessions(project);
          // Auto-migrate: if no sessions exist but history.json has data, create a default session
          if (sessions.length === 0) {
            const history = this.projectRepo.getHistory(project);
            if (history.length > 0) {
              const defaultId = this.projectRepo.createChatSession(project, "Default");
              // Write the entire history payload at once to prevent O(N^2) synchronous disk bottleneck
              const file = this.projectRepo._sessionMsgFile(project, defaultId);
              this.projectRepo.writeJson(file, history);
            }
            return new WorkflowResult("ok", this.projectRepo.listChatSessions(project));
          }
          return new WorkflowResult("ok", sessions);
        }
        case "create": {
          const id = this.projectRepo.createChatSession(project, name);
          return new WorkflowResult("ok", { id, name: name || "New Chat" });
        }
        case "rename": {
          this.projectRepo.renameChatSession(project, chatId, name);
          return new WorkflowResult("ok", { id: chatId, name });
        }
        case "delete": {
          this.projectRepo.deleteChatSession(project, chatId);
          return new WorkflowResult("ok", { id: chatId });
        }
        case "load": {
          const messages = this.projectRepo.loadChatSession(project, chatId);
          return new WorkflowResult("ok", { messages, chatId });
        }
        case "append": {
          this.projectRepo.appendChatMessage(project, chatId, entry);
          return new WorkflowResult("ok", { ok: true });
        }
        default:
          return new WorkflowResult("error", { error: `Unknown action: ${action}` });
      }
    } catch (err) {
      return new WorkflowResult("error", { error: "Chat session error", detail: String(err) });
    }
  }
}

module.exports = ChatSessionWorkflow;
