// ──────────────────────────────────────────────────────────────────
// File:    registerWorkflows.js
// Version: 1.1.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// SDOA Version
exports.VERSION = "1.1.0";
exports.getVersion = () => exports.VERSION;

const registry = require("./WorkflowRegistryInstance");

const SendMessageWorkflow        = require("./SendMessage.workflow");
const ListProjectsWorkflow       = require("./ListProjects.workflow");
const ListProfilesWorkflow       = require("./ListProfiles.workflow");
const LoadProjectHistoryWorkflow = require("./LoadProjectHistory.workflow");
const VoiceChatWorkflow          = require("./VoiceChat.workflow");
const SpellcheckWorkflow         = require("./Spellcheck.workflow");
const VersionInfoWorkflow        = require("./VersionInfo.workflow");
const ImageGenWorkflow           = require("./ImageGen.workflow");
const DeepSearchWorkflow         = require("./DeepSearch.workflow");
const FilePermissionsWorkflow    = require("./FilePermissions.workflow");
const FileContextWorkflow        = require("./FileContext.workflow");
const ChatSessionWorkflow        = require("./ChatSession.workflow");
const ListFilesWorkflow          = require("./ListFiles.workflow");
const SpawnShellWorkflow         = require("./SpawnShell.workflow");
const ListProcessesWorkflow      = require("./ListProcesses.workflow");
const MultiModelSendWorkflow     = require("./MultiModelSend.workflow");
const GoogleDriveWorkflow        = require("./GoogleDrive.workflow");
const MemoryDistillerWorkflow    = require("./MemoryDistiller.workflow");

// SDOA v5.0 MANIFEST
const MANIFEST = {
    id:           "RegisterWorkflows.utility",
    type:         "utility",
    layer:        3,
    runtime:      "NodeJS",
    version:      "1.1.1",
    capabilities: ["workflow:bulk-register"],
    dependencies: [],
    docs: {
        description: "Bootstrap script that requires each backend workflow class and registers it into the shared WorkflowRegistryInstance singleton.",
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


function registerAllWorkflows() {
    registry.register("SendMessage.workflow",        SendMessageWorkflow);
    registry.register("MultiModelSend.workflow",     MultiModelSendWorkflow);
    registry.register("ListProjects.workflow",       ListProjectsWorkflow);
    registry.register("ListProfiles.workflow",       ListProfilesWorkflow);
    registry.register("LoadProjectHistory.workflow", LoadProjectHistoryWorkflow);
    registry.register("VoiceChat.workflow",          VoiceChatWorkflow);
    registry.register("Spellcheck.workflow",         SpellcheckWorkflow);
    registry.register("VersionInfo.workflow",        VersionInfoWorkflow);
    registry.register("ImageGen.workflow",           ImageGenWorkflow);
    registry.register("DeepSearch.workflow",         DeepSearchWorkflow);
    registry.register("FilePermissions.workflow",    FilePermissionsWorkflow);
    registry.register("FileContext.workflow",        FileContextWorkflow);
    registry.register("ChatSession.workflow",        ChatSessionWorkflow);
    registry.register("ListFiles.workflow",          ListFilesWorkflow);
    registry.register("SpawnShell.workflow",         SpawnShellWorkflow);
    registry.register("ListProcesses.workflow",      ListProcessesWorkflow);
    registry.register("GoogleDrive.workflow",        GoogleDriveWorkflow);
    registry.register("MemoryDistiller.workflow",    MemoryDistillerWorkflow);
}

module.exports = { registerAllWorkflows, MANIFEST };
