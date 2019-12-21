import * as vscode from 'vscode';
import getPort from 'get-port';

import { GradleTasksTreeDataProvider } from './gradleView';
import {
  invalidateTasksCache,
  GradleTaskProvider,
  hasGradleProject,
  stopTask,
  stopRunningGradleTasks
} from './tasks';
import {
  registerServer,
  registerClient,
  GradleTasksClient,
  GradleTasksServer
} from './server';

import { getIsTasksExplorerEnabled } from './config';

let treeDataProvider: GradleTasksTreeDataProvider | undefined;

function registerTaskProvider(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
  statusBarItem: vscode.StatusBarItem
): GradleTaskProvider | undefined {
  function invalidateTaskCaches(): void {
    invalidateTasksCache();
    if (treeDataProvider) {
      treeDataProvider.refresh();
    }
  }

  if (vscode.workspace.workspaceFolders) {
    const buildFileGlob = `**/*.{gradle,gradle.kts}`;
    const watcher = vscode.workspace.createFileSystemWatcher(buildFileGlob);
    context.subscriptions.push(watcher);
    watcher.onDidChange(invalidateTaskCaches);
    watcher.onDidDelete(invalidateTaskCaches);
    watcher.onDidCreate(invalidateTaskCaches);

    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(
      invalidateTaskCaches
    );
    context.subscriptions.push(workspaceWatcher);

    const provider = new GradleTaskProvider(
      statusBarItem,
      outputChannel,
      context
    );

    const taskProvider = vscode.tasks.registerTaskProvider('gradle', provider);
    context.subscriptions.push(taskProvider);

    return provider;
  }
  return undefined;
}

function registerExplorer(
  context: vscode.ExtensionContext,
  collapsed: boolean,
  client: GradleTasksClient
): void {
  if (vscode.workspace.workspaceFolders) {
    treeDataProvider = new GradleTasksTreeDataProvider(
      context,
      collapsed,
      client
    );
    context.subscriptions.push(
      vscode.window.createTreeView('gradleTreeView', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
      })
    );
  }
}

function registerCommands(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
  statusBarItem: vscode.StatusBarItem,
  client: GradleTasksClient
): void {
  if (treeDataProvider) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gradle.runTask',
        treeDataProvider.runTask,
        treeDataProvider
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gradle.runTaskWithArgs',
        treeDataProvider.runTaskWithArgs,
        treeDataProvider
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.stopTask', task => {
        if (task) {
          stopTask(task);
          statusBarItem.hide();
        }
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.stopTreeItemTask', treeItem => {
        if (treeItem && treeItem.task) {
          vscode.commands.executeCommand('gradle.stopTask', treeItem.task);
        }
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.refresh', () =>
        treeDataProvider!.refresh()
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.explorerTree', () => {
        treeDataProvider!.setCollapsed(false);
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.explorerFlat', () => {
        treeDataProvider!.setCollapsed(true);
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.killGradleProcess', () => {
        client.stopGetTasks();
        stopRunningGradleTasks();
        statusBarItem.hide();
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gradle.showGradleProcessInformationMessage',
        async () => {
          const OPT_LOGS = 'View Logs';
          const OPT_CANCEL = 'Cancel Process';
          const input = await vscode.window.showInformationMessage(
            'Gradle Tasks Process',
            OPT_LOGS,
            OPT_CANCEL
          );
          if (input === OPT_LOGS) {
            outputChannel.show();
          } else if (input === OPT_CANCEL) {
            vscode.commands.executeCommand('gradle.killGradleProcess');
          }
        }
      )
    );
  }
}

export interface ExtensionApi {
  treeDataProvider: GradleTasksTreeDataProvider | undefined;
  context: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi | void> {
  const outputChannel = vscode.window.createOutputChannel('Gradle Tasks');
  context.subscriptions.push(outputChannel);

  let server: GradleTasksServer | undefined;
  let client: GradleTasksClient | undefined;

  const statusBarItem = vscode.window.createStatusBarItem();
  context.subscriptions.push(statusBarItem);
  statusBarItem.command = 'gradle.showGradleProcessInformationMessage';

  const taskProvider = registerTaskProvider(
    context,
    outputChannel,
    statusBarItem
  );

  if (await hasGradleProject()) {
    const port = await getPort();
    try {
      server = await registerServer(
        { port, host: 'localhost' },
        outputChannel,
        context
      );
      context.subscriptions.push(server);
    } catch (e) {
      outputChannel.appendLine(`Unable to start tasks server: ${e.toString()}`);
      return;
    }

    try {
      client = await registerClient(server, outputChannel, statusBarItem);
      context.subscriptions.push(client);
    } catch (e) {
      outputChannel.appendLine(
        `Unable to connect to tasks server: ${e.toString()}`
      );
      return;
    }

    if (client) {
      taskProvider?.setClient(client);
      const explorerCollapsed = context.workspaceState.get(
        'explorerCollapsed',
        true
      );
      registerExplorer(context, explorerCollapsed, client);
      registerCommands(context, outputChannel, statusBarItem, client);

      if (treeDataProvider) {
        treeDataProvider.refresh();
      }
      if (getIsTasksExplorerEnabled()) {
        vscode.commands.executeCommand(
          'setContext',
          'gradle:showTasksExplorer',
          true
        );
      }
    }
  }
  return { treeDataProvider, context, outputChannel };
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
