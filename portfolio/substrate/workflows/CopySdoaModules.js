// ──────────────────────────────────────────────────────────────────
// File:    CopySdoaModules.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-03 03:45 UTC
// ============================================================
// CopySdoaModules — SDOA v3.0 Task
// organizers all SDOA modules from legacy directories to new structure.
// ============================================================

const { Task } = require('../base/sdoa-base.js');
const fs = require('fs');
const path = require('path');

class CopySdoaModules extends Task {
    static MANIFEST = {
        id: "CopySdoaModules.task",
        type: "task",
        layer: 3,
        runtime: "NodeJS",
        version: "1.0.1",
        last_modified: "2026-07-13T00:00:00Z",
        capabilities: [
            "repository.reorganize",
            "files.copy"
        ],
        dependencies: [],
        docs: {
            description: "Organizes and copies all SDOA modules from legacy folders to the new standardized portfolio layout.",
            author: "ProtoAI Core Team"
        }
    };

    async run(payload = {}) {
        const srcRoot = 'C:\\Projects\\SDOAvX';
        const destRoot = 'C:\\Projects\\SDOAvX';

        // Same mappings array as in script
        const mappings = [
            ['non-sdoavx/modules_components_HealthView.tsx', 'ui/dashboards/HealthView.tsx'],
            ['non-sdoavx/modules_dashboards_SystemHealth.rs', 'ui/dashboards/SystemHealth.rs'],
            ['portfolio/LlmSettings.py', 'ui/dashboards/LlmSettings.py'],
            ['ui/components/FileList.ui.js', 'ui/primitives/FileList/FileList.ui.js'],
            ['ui/components/FileTree.ui.js', 'ui/primitives/FileTree/FileTree.ui.js'],
            ['ui/components/ManifestPanel.ui.js', 'ui/primitives/ManifestPanel/ManifestPanel.ui.js'],
            ['non-sdoavx/ui_CodeEditor_CodeEditor.prim.js', 'ui/primitives/CodeEditor/CodeEditor.prim.js'],
            ['non-sdoavx/modules_components_PaletteInput.tsx', 'ui/primitives/CommandPalette/PaletteInput.tsx'],
            ['ui/components/PartnerTicker.v3.ui.js', 'ui/features/PartnerTicker/PartnerTicker.v3.ui.js'],
            ['non-sdoavx/ui_components_GoogleDriveConnector.ui.js', 'ui/features/GoogleDriveConnector/GoogleDriveConnector.ui.js'],
            ['non-sdoavx/ui_ui_app.js', 'ui/app.js'],
            ['non-sdoavx/ui_ui_index.html', 'ui/index.html'],
            ['non-sdoavx/ui_ui_primitives.html', 'ui/primitives.html'],
            ['portfolio/LlmBridge.js', 'substrate/bridges/LlmBridge.js'],
            ['portfolio/ContextEngine.py', 'substrate/engines/ContextEngine.py'],
            ['portfolio/LlmPolicyEngine.js', 'substrate/engines/LlmPolicyEngine.js'],
            ['non-sdoavx/modules_engines_CommandPalette.rs', 'substrate/engines/CommandPalette.rs'],
            ['non-sdoavx/server_local_model_qwen_server.py', 'substrate/engines/qwen_server.py'],
            ['non-sdoavx/harness_src_Types.ts', 'evolution/legacy/Types.ts'],
            ['non-sdoavx/server_services_Router.service.js', 'evolution/legacy/Router.service.js'],
            ['non-sdoavx/ui_lib_tauri-utils.js', 'evolution/legacy/tauri-utils.js'],
            ['non-sdoavx/server_local_model_bootstrap.py', 'authorities/bootstrap/bootstrap.py'],
            ['server/services/Router.service.js', 'authorities/router/Router.service.js'],
            ['server/index.ts', 'authorities/conductor/index.ts'],
            ['server/services/Registrar.service.ts', 'authorities/registrar/Registrar.service.ts'],
            ['Registrar.service.js', 'authorities/registrar/Registrar.service.js'],
            ['server/services/Registry.service.ts', 'authorities/registrar/Registry.service.ts'],
            ['server/services/Captain.service.js', 'authorities/captain/Captain.service.js'],
            ['portfolio/BackendConnector.js', 'substrate/services/BackendConnector.js'],
            ['portfolio/FileManager.js', 'substrate/services/FileManager.js'],
            ['portfolio/ModelManager.js', 'substrate/services/ModelManager.js'],
            ['portfolio/ProvisioningService.py', 'substrate/services/ProvisioningService.py'],
            ['portfolio/RefactorService.py', 'substrate/services/RefactorService.py'],
            ['portfolio/SystemHealth.py', 'substrate/services/SystemHealth.py'],
            ['non-sdoavx/server_orchestration_CommentaryPool.js', 'substrate/services/CommentaryPool.js'],
            ['non-sdoavx/server_services_AuthListener.service.js', 'substrate/services/AuthListener.service.js'],
            ['non-sdoavx/server_services_Middleware.service.js', 'substrate/services/Middleware.service.js'],
            ['non-sdoavx/server_services_ResponseFormatter.service.js', 'substrate/services/ResponseFormatter.service.js'],
            ['ui/components/EventBus.ui.js', 'substrate/services/EventBus.ui.js'],
            ['ui/services/ModuleLoader.service.js', 'substrate/services/ModuleLoader.service.js'],
            ['portfolio/BunInstaller.js', 'substrate/adapters/BunInstaller.js'],
            ['portfolio/QmdAdapter.js', 'substrate/adapters/QmdAdapter.js'],
            ['ui/components/BackendConnector.ui.js', 'substrate/adapters/BackendConnector.ui.js'],
            ['ui/components/LlmPolicyEngine.ui.js', 'substrate/adapters/LlmPolicyEngine.ui.js'],
            ['ui/components/LlmBridge.ui.js', 'substrate/adapters/LlmBridge.ui.js'],
            ['ui/components/QmdAdapter.ui.js', 'substrate/adapters/QmdAdapter.ui.js'],
            ['ui/adapters/StateStore.adapter.js', 'substrate/adapters/StateStore.adapter.js'],
            ['portfolio/IngestWorkflow.js', 'substrate/workflows/IngestWorkflow.js'],
            ['portfolio/QuickAction.js', 'substrate/workflows/QuickAction.js'],
            ['non-sdoavx/server_workflows_GoogleDrive.workflow.js', 'substrate/workflows/GoogleDrive.workflow.js'],
            ['base/sdoa-base.js', 'substrate/base/sdoa-base.js'] // Also reorganize sdoa-base.js!
        ];

        // Add dynamically scanned server services, adapters, workflows
        const serverServices = fs.readdirSync(path.join(srcRoot, 'server', 'services'));
        serverServices.forEach(file => {
            const filePath = path.join('server', 'services', file);
            const isAuthority = ['Router.service.js', 'Registrar.service.ts', 'Registry.service.ts', 'Captain.service.js'].includes(file);
            const isWorkflow = file.toLowerCase().includes('workflow');
            const isAdapter = ['LocalModelAdapter.js'].includes(file);
            if (isAuthority) return;
            if (isWorkflow) {
                mappings.push([filePath, path.join('substrate', 'workflows', file)]);
            } else if (isAdapter) {
                mappings.push([filePath, path.join('substrate', 'adapters', file)]);
            } else {
                mappings.push([filePath, path.join('substrate', 'services', file)]);
            }
        });

        const serverAdapters = fs.readdirSync(path.join(srcRoot, 'server', 'adapters'));
        serverAdapters.forEach(file => {
            const filePath = path.join('server', 'adapters', file);
            mappings.push([filePath, path.join('substrate', 'adapters', file)]);
        });

        const serverWorkflows = fs.readdirSync(path.join(srcRoot, 'server', 'workflows'));
        serverWorkflows.forEach(file => {
            const filePath = path.join('server', 'workflows', file);
            mappings.push([filePath, path.join('substrate', 'workflows', file)]);
        });

        let copiedCount = 0;
        let errorCount = 0;

        mappings.forEach(([srcRel, destRel]) => {
            const srcPath = path.join(srcRoot, srcRel.replace(/\//g, path.sep));
            const destPath = path.join(destRoot, destRel.replace(/\//g, path.sep));

            try {
                if (!fs.existsSync(srcPath)) {
                    errorCount++;
                    return;
                }
                const destDir = path.dirname(destPath);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                fs.copyFileSync(srcPath, destPath);
                copiedCount++;
            } catch (e) {
                errorCount++;
            }
        });

        this.bump_patch(`SDOAvX reorganization task completed: ${copiedCount} files copied, ${errorCount} errors.`);
        return { status: "ok", copied: copiedCount, errors: errorCount };
    }
}

module.exports = CopySdoaModules;
