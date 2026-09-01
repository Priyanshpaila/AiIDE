import { useRef, useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Command } from "@tauri-apps/plugin-shell";
import { exit } from "@tauri-apps/plugin-process";

import Editor, { DiffEditor, OnMount, loader } from "@monaco-editor/react";
import { useVoiceToCode, streamAIPrompt } from "./hooks/useVoiceToCode";
import Bootstrap from "./Bootstrap";
import TerminalComponent from "./components/Terminal";
import FileTree from "./components/FileTree";
import ProfilePage from "./components/ProfilePage";
import * as monaco from "monaco-editor";

// Configure Monaco to use the locally bundled version instead of the CDN
loader.config({ monaco });

import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Terminal as XTerm } from "@xterm/xterm";
import { 
  VscPlay, VscMic, VscFolderOpened, VscSettingsGear, VscBell, 
  VscChevronDown, VscChevronUp, VscSearch, VscNewFile, VscTerminal, 
  VscBug, VscLightbulb, VscSymbolString, VscBook, VscDash, VscClose
} from "react-icons/vsc";
import "./App.css";

type Tab = {
  id: string;
  name: string;
  path: string;
  content: string;
  lang: string;
};

type Project = {
  id: string;
  name: string;
  folders: string[];
};

export type ActivityLogEntry = {
  id: string;
  type: 'code' | 'project' | 'system';
  title: string;
  desc: string;
  timestamp: number;
};

function App() {
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  useEffect(() => {
    let unlistenFn: any = null;
    const setup = async () => {
      unlistenFn = await getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault();
        try {
          Command.create("powershell", ["-Command", "Stop-Process -Name 'llama-server*' -Force -ErrorAction SilentlyContinue"]).spawn();
          Command.create("powershell", ["-Command", "Stop-Process -Name 'whisper-server*' -Force -ErrorAction SilentlyContinue"]).spawn();
        } catch (e) {}
        
        setTimeout(async () => {
            if (unlistenFn) { unlistenFn(); }
            await exit(0);
        }, 100);
      });
    };
    setup();
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);
  const [userName, setUserName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("voiceide_username");
      if (saved) return saved;
    } catch (e) {}
    return "";
  });
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [activeView, setActiveView] = useState<'ide' | 'profile'>('ide');

  const [aiGenerations, setAiGenerations] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem("voiceide_ai_generations") || "0");
    } catch (e) { return 0; }
  });
  
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem("voiceide_activity_log");
      if (saved) return JSON.parse(saved);
    } catch (e) { return []; }
    return [];
  });
  
  const [activityDays, setActivityDays] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("voiceide_activity_days");
      if (saved) return JSON.parse(saved);
    } catch (e) { return {}; }
    return {};
  });

  const logActivity = (type: 'code'|'project'|'system', title: string, desc: string) => {
    const entry: ActivityLogEntry = { id: Date.now().toString(), type, title, desc, timestamp: Date.now() };
    setActivityLog(prev => {
      const updated = [entry, ...prev].slice(0, 50);
      localStorage.setItem("voiceide_activity_log", JSON.stringify(updated));
      return updated;
    });
    
    // Update daily contribution
    const today = new Date().toISOString().split('T')[0];
    setActivityDays(prev => {
      const count = (prev[today] || 0) + 1;
      const updated = { ...prev, [today]: count };
      localStorage.setItem("voiceide_activity_days", JSON.stringify(updated));
      return updated;
    });
  };

  const incrementGenerations = () => {
    setAiGenerations(prev => {
      const updated = prev + 1;
      localStorage.setItem("voiceide_ai_generations", updated.toString());
      return updated;
    });
  };

  useEffect(() => {
    if (isBootstrapped && !userName) {
      setShowSetupModal(true);
    }
  }, [isBootstrapped, userName]);

  const handleSaveInitialName = (name: string) => {
    const finalName = name.trim() || "VoiceCoder";
    setUserName(finalName);
    localStorage.setItem("voiceide_username", finalName);
    setShowSetupModal(false);
  };
  
  const handleUpdateName = (name: string) => {
    setUserName(name);
    localStorage.setItem("voiceide_username", name);
  };

  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem("voiceide_projects");
      if (saved) return JSON.parse(saved);
      const oldFolders = localStorage.getItem("voiceide_folders");
      if (oldFolders) return [{ id: 'default-' + Date.now(), name: 'My Project', folders: JSON.parse(oldFolders) }];
    } catch (e) {}
    return [];
  });
  const [standaloneFolders, setStandaloneFolders] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("voiceide_standalone");
      if (saved) return JSON.parse(saved);
      const oldFolders = localStorage.getItem("voiceide_folders");
      if (oldFolders) return JSON.parse(oldFolders);
    } catch (e) {}
    return [];
  });
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [activeFolderPath, setActiveFolderPath] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem("voiceide_active_folder");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });
  
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      const saved = localStorage.getItem("voiceide_tabs");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("voiceide_active_tab");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return "";
  });
  const [showDiff, setShowDiff] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  
  const [isTerminalVisible, setIsTerminalVisible] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState<"problems"|"output"|"terminal"|"debug">("terminal");
  const [problems, setProblems] = useState<monaco.editor.IMarker[]>([]);
  const [outputLogs, setOutputLogs] = useState<string[]>(["VoiceIDE Output initialized..."]);
  const [debugLogs, setDebugLogs] = useState<string[]>(["VoiceIDE Debug Console ready..."]);

  // Multiple Terminals
  const [terminals, setTerminals] = useState<{id: string, name: string}[]>([{ id: "term-1", name: "1: Terminal" }]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>("term-1");
  const terminalRefs = useRef<Record<string, XTerm>>({});

  const getActiveTerminal = () => terminalRefs.current[activeTerminalId];

  const createNewTerminal = () => {
    const newId = `term-${Date.now()}`;
    const newName = `${terminals.length + 1}: Node`;
    setTerminals(prev => [...prev, { id: newId, name: newName }]);
    setActiveTerminalId(newId);
    setActiveBottomTab("terminal");
  };

  const deleteTerminal = () => {
    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== activeTerminalId);
      if (filtered.length > 0) {
        setActiveTerminalId(filtered[filtered.length - 1].id);
      }
      return filtered.length > 0 ? filtered : [{ id: `term-${Date.now()}`, name: "1: Terminal" }];
    });
    delete terminalRefs.current[activeTerminalId];
  };

  useEffect(() => {
    const disposable = monaco.editor.onDidChangeMarkers(() => {
      setProblems(monaco.editor.getModelMarkers({}));
    });
    return () => disposable.dispose();
  }, []);

  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = (...args) => {
      setDebugLogs(prev => [...prev, `[LOG] ${args.map(a => a instanceof Error ? a.message : (typeof a === 'object' ? JSON.stringify(a) : a)).join(" ")}`]);
      originalLog(...args);
    };
    console.error = (...args) => {
      setDebugLogs(prev => [...prev, `[ERR] ${args.map(a => a instanceof Error ? a.message : (typeof a === 'object' ? JSON.stringify(a) : a)).join(" ")}`]);
      originalError(...args);
    };
    console.warn = (...args) => {
      setDebugLogs(prev => [...prev, `[WARN] ${args.map(a => a instanceof Error ? a.message : (typeof a === 'object' ? JSON.stringify(a) : a)).join(" ")}`]);
      originalWarn(...args);
    };
    
    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const appendOutput = (msg: string) => {
    setOutputLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    localStorage.setItem("voiceide_projects", JSON.stringify(projects));
    localStorage.setItem("voiceide_standalone", JSON.stringify(standaloneFolders));
    localStorage.setItem("voiceide_tabs", JSON.stringify(tabs));
    localStorage.setItem("voiceide_active_tab", JSON.stringify(activeTabId));
    localStorage.setItem("voiceide_active_folder", JSON.stringify(activeFolderPath));
  }, [projects, standaloneFolders, tabs, activeTabId, activeFolderPath]);
  
  const activeTab = tabs.find(t => t.id === activeTabId) || (tabs.length > 0 ? tabs[0] : undefined);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const streamBufferRef = useRef<string>("");

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleDiffEditorDidMount = (editor: any) => {
    diffEditorRef.current = editor as any;
  };

  // Update tab content on edit
  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    setTabs(tabs.map(t => t.id === activeTabId ? { ...t, content: value } : t));
  };

  const createNewTab = (lang: string, content: string, path: string = "", name?: string) => {
    const ext = lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang === 'cpp' ? 'cpp' : lang === 'c' ? 'c' : lang;
    const newId = `scratch-${Date.now()}`;
    const newTab = {
      id: newId,
      name: name || `scratch.${ext}`,
      path,
      content,
      lang
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const openNewFileModal = () => {
    setNewFileName("");
    setShowNewFileModal(true);
  };

  const submitNewFile = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newFileName.trim()) return;

    let fileName = newFileName.trim();
    const ext = activeTab?.lang === 'python' ? 'py' : activeTab?.lang === 'javascript' ? 'js' : activeTab?.lang === 'cpp' ? 'cpp' : activeTab?.lang === 'c' ? 'c' : activeTab?.lang || 'txt';
    
    if (!fileName.includes('.')) {
      fileName += `.${ext}`;
    }
    
    setShowNewFileModal(false);

    if ((projects.some(p => p.folders.length > 0) || standaloneFolders.length > 0)) {
      let targetFolder = activeFolderPath || standaloneFolders[0] || (projects.find(p => p.folders.length > 0)?.folders[0] || "");

      try {
        const { join } = await import("@tauri-apps/api/path");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const newPath = await join(targetFolder, fileName);
        await writeTextFile(newPath, "");
        setRefreshTrigger(prev => prev + 1);
        createNewTab(activeTab?.lang || 'python', "", newPath, fileName);
      } catch (err) {
        console.error("Failed to create file:", err);
      }
    } else {
      createNewTab(activeTab?.lang || 'python', "", "", fileName);
    }
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (newTabs.length === 0) {
      setActiveTabId("");
    } else if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const handleAIGeneratedChunk = (code: string, isComplete?: boolean, isStart?: boolean) => {
    if (isStart) {
      streamBufferRef.current = "";
      setShowDiff(true);
    }

    streamBufferRef.current += code;

    if (isComplete) {
      let finalCode = streamBufferRef.current;
      
      const match = finalCode.match(/```([a-zA-Z0-9+-]+)(?:\r?\n)/);
      let detectedLang = activeTab?.lang;
      if (match && match[1]) {
        detectedLang = match[1].toLowerCase();
      }
      
      const cleaned = finalCode.replace(/```[a-zA-Z0-9+-]*\r?\n?/g, "").replace(/```/g, "");
      
      if (!activeTabIdRef.current) {
        setShowDiff(false);
        createNewTab(detectedLang || 'python', cleaned);
      } else {
        setTabs(prevTabs => prevTabs.map(t => 
          t.id === activeTabIdRef.current ? { ...t, content: cleaned } : t
        ));
        setShowDiff(false);
        
        if (editorRef.current) {
           const model = editorRef.current.getModel();
           if (model) {
               editorRef.current.executeEdits("ai-edit", [{
                   range: model.getFullModelRange(),
                   text: cleaned,
                   forceMoveMarkers: true
               }]);
           }
        }
      }
      return;
    }
    
    if (diffEditorRef.current) {
       const modifiedModel = diffEditorRef.current.getModel()?.modified;
       if (modifiedModel) {
          modifiedModel.setValue(streamBufferRef.current);
       }
    }
  };

  const { isRecording, status, toggleRecording } = useVoiceToCode(
    () => activeTab?.content || '',
    (code, isComplete, isStart) => {
      if (isStart) {
        logActivity('code', 'Voice Code', 'Generated code using Voice AI');
        incrementGenerations();
      }
      handleAIGeneratedChunk(code, isComplete, isStart);
    }
  );

  const handleDebug = async () => {
    if (!activeTab || !(activeTab?.content || '').trim()) return;
    setActiveBottomTab("output");
    appendOutput(`Starting AI Debug process for ${activeTab?.name || ''}...`);
    logActivity('code', 'Generated Code', 'Used AI to debug code');
    incrementGenerations();
    const sysPrompt = "You are an expert debugger. Fix any errors or logical bugs in the provided code. Output ONLY the raw corrected code wrapped in a markdown code block (e.g. ```python). Keep the same language. Ensure the output runs flawlessly.";
    const userPrompt = `Debug and fix the following code:\n\n${activeTab?.content || ''}`;
    await streamAIPrompt(sysPrompt, userPrompt, handleAIGeneratedChunk);
  };

  const handleOptimize = async () => {
    if (!activeTab || !(activeTab?.content || '').trim()) return;
    setActiveBottomTab("output");
    appendOutput(`Starting AI Optimization process for ${activeTab?.name || ''}...`);
    logActivity('code', 'Optimized Code', 'Used AI to optimize performance');
    incrementGenerations();
    const sysPrompt = "You are an expert performance optimizer. Rewrite the provided code to be significantly more efficient (e.g., O(1) instead of O(n^2)) while maintaining the exact same logic and functionality. Output ONLY the raw optimized code wrapped in a markdown code block. Keep the same language.";
    const userPrompt = `Optimize the following code for better performance and time/space complexity:\n\n${activeTab?.content || ''}`;
    await streamAIPrompt(sysPrompt, userPrompt, handleAIGeneratedChunk);
  };

  const handleTranslate = async () => {
    if (!activeTab || !(activeTab?.content || '').trim()) return;
    const targetLang = prompt("Enter target programming language (e.g., c++, python, rust):");
    if (!targetLang) return;
    
    setActiveBottomTab("output");
    appendOutput(`Starting AI Translation to ${targetLang} for ${activeTab?.name || ''}...`);
    logActivity('code', 'Translated Code', `Translated to ${targetLang}`);
    incrementGenerations();
    const sysPrompt = `You are an expert code translator. Translate the provided code into ${targetLang} without changing the underlying logic or functionality. Use idiomatic patterns for ${targetLang}. Output ONLY the raw translated code wrapped in a markdown code block (e.g. \`\`\`${targetLang}).`;
    const userPrompt = `Translate the following code to ${targetLang}:\n\n${activeTab?.content || ''}`;
    await streamAIPrompt(sysPrompt, userPrompt, handleAIGeneratedChunk);
  };

  const handleDocumentation = async () => {
    if (projects.length === 0 && standaloneFolders.length === 0 && (!activeTab || !(activeTab?.content || '').trim())) {
      alert("Please open a folder or write some code to generate documentation.");
      return;
    }
    
    setActiveBottomTab("output");
    appendOutput(`Initializing Documentation generation...`);
    
    if (getActiveTerminal()) {
      getActiveTerminal().writeln(`\r\n\x1b[1;36m> Generating project documentation...\x1b[0m`);
    }
    
    let combinedCode = "";
    let targetFolder = (projects.some(p => p.folders.length > 0) || standaloneFolders.length > 0) ? (activeFolderPath || (projects.find(p => p.folders.length > 0)?.folders[0] || "")) : null;
    
    if (targetFolder) {
      try {
        const { readDir, readTextFile } = await import("@tauri-apps/plugin-fs");
        const { join } = await import("@tauri-apps/api/path");
        
        const readFolderRecursive = async (path: string, depth = 0) => {
          if (depth > 3) return; // Prevent infinite/massive trees
          const entries = await readDir(path);
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.includes('scratch.bat') || entry.name.endsWith('.exe')) continue;
            
            const fullPath = await join(path, entry.name);
            if (entry.isDirectory) {
              await readFolderRecursive(fullPath, depth + 1);
            } else {
              if (entry.name.match(/\.(py|cpp|c|js|ts|jsx|tsx|html|css|json|md|txt)$/)) {
                 const content = await readTextFile(fullPath);
                 combinedCode += `\n\n--- File: ${entry.name} ---\n${content}`;
              }
            }
          }
        };
        await readFolderRecursive(targetFolder);
      } catch (e) {
        console.error("Failed to read project files for documentation:", e);
      }
    } else {
      combinedCode = `\n\n--- File: ${activeTab?.name || ''} ---\n${activeTab?.content || ''}`;
    }
    
    logActivity('code', 'Generated Documentation', 'Used AI to generate README.md');
    incrementGenerations();
    const sysPrompt = "You are an expert technical writer. Analyze the provided project files and generate a clean, comprehensive README.md documentation explaining what the project is, its structure, and how it works. Output ONLY the raw markdown wrapped in a ```markdown block.";
    const userPrompt = `Generate documentation for this project based on these files:\n${combinedCode.substring(0, 15000)}`;
    
    let newTabId = "";
    let docBuffer = "";
    let readmePath = "";
    
    if (targetFolder) {
      try {
        const { join } = await import("@tauri-apps/api/path");
        readmePath = await join(targetFolder, "README.md");
      } catch (e) {}
    }
    
    await streamAIPrompt(sysPrompt, userPrompt, async (code, isComplete, isStart) => {
      if (isStart) {
        newTabId = `doc-${Date.now()}`;
        setTabs(prev => [...prev, {
          id: newTabId, name: 'README.md', path: readmePath, content: '', lang: 'markdown'
        }]);
        setActiveTabId(newTabId);
        
        if (readmePath) {
          try {
            const { writeTextFile } = await import("@tauri-apps/plugin-fs");
            await writeTextFile(readmePath, "");
            setRefreshTrigger(prev => prev + 1);
          } catch(e) {}
        }
      }
      docBuffer += code;
      const cleaned = docBuffer.replace(/```[a-zA-Z0-9+-]*\r?\n?/g, "").replace(/```/g, "");
      setTabs(prev => prev.map(t => t.id === newTabId ? { ...t, content: cleaned } : t));
      
      if (isComplete && readmePath) {
         try {
           const { writeTextFile } = await import("@tauri-apps/plugin-fs");
           await writeTextFile(readmePath, cleaned);
         } catch(e) {}
      }
    });
  };



  const handleOpenStandaloneFolder = async () => {
    try {
      const selectedPath = await open({ directory: true, multiple: false });
      if (selectedPath && typeof selectedPath === 'string') {
        logActivity('project', 'Opened Standalone Folder', 'Added standalone folder');
        setStandaloneFolders(prev => prev.includes(selectedPath) ? prev : [...prev, selectedPath]);
        setActiveFolderPath(selectedPath);
      }
    } catch (err) {
      console.error("Failed to open folder", err);
    }
  };

  const handleCloseStandaloneFolder = (folderToClose: string) => {
    setStandaloneFolders(prev => prev.filter(p => p !== folderToClose));
    if (activeFolderPath === folderToClose) setActiveFolderPath(null);
  };

  const handleStandalonePathChange = (oldPath: string, newPath: string) => {
    setStandaloneFolders(prev => prev.map(p => p === oldPath ? newPath : p));
    if (activeFolderPath === oldPath) setActiveFolderPath(newPath);
    setTabs(prev => prev.map(t => {
      if (t.path.startsWith(oldPath)) return { ...t, path: t.path.replace(oldPath, newPath) };
      return t;
    }));
  };

  const handleStandaloneDelete = (path: string) => {
    setStandaloneFolders(prev => prev.filter(p => p !== path));
    if (activeFolderPath === path) setActiveFolderPath(null);
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    const newProj: Project = { id: 'proj-' + Date.now(), name: newProjectName.trim(), folders: [] };
    setProjects(prev => [...prev, newProj]);
    setExpandedProjects(prev => ({ ...prev, [newProj.id]: true }));
    setNewProjectName("");
    setShowCreateProjectModal(false);
    logActivity('project', 'Created Project', `Created new project: ${newProjectName.trim()}`);
  };

  const handleOpenFolder = async (projectId: string) => {
    try {
      const selectedPath = await open({ directory: true, multiple: false });
      if (selectedPath && typeof selectedPath === 'string') {
        logActivity('project', 'Opened Folder', 'Added folder to workspace');
        setProjects(prev => prev.map(p => {
          if (p.id === projectId && !p.folders.includes(selectedPath)) {
            return { ...p, folders: [...p.folders, selectedPath] };
          }
          return p;
        }));
        setExpandedProjects(prev => ({ ...prev, [projectId]: true }));
        setActiveFolderPath(selectedPath);
      }
    } catch (err) {
      console.error("Failed to open folder dialog", err);
    }
  };

  const handleCloseFolder = (projectId: string, folderToClose: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id === projectId) {
        return { ...p, folders: p.folders.filter(f => f !== folderToClose) };
      }
      return p;
    }));
    if (activeFolderPath === folderToClose) {
      setActiveFolderPath(null);
    }
  };

  const handleProjectPathChange = (oldPath: string, newPath: string) => {
    setProjects(prev => prev.map(p => ({
      ...p,
      folders: p.folders.map(f => f === oldPath ? newPath : f)
    })));
    if (activeFolderPath === oldPath) setActiveFolderPath(newPath);
    setTabs(prev => prev.map(t => {
      if (t.path.startsWith(oldPath)) {
        return { ...t, path: t.path.replace(oldPath, newPath) };
      }
      return t;
    }));
  };

  const handleProjectDelete = (path: string) => {
    setProjects(prev => prev.map(p => ({
      ...p,
      folders: p.folders.filter(f => f !== path)
    })));
    if (activeFolderPath === path) setActiveFolderPath(null);
    setTabs(prev => prev.map(t => t)); // We probably want to close tabs, but let's keep it simple
  };

  const handleFileClick = async (filePath: string) => {
    try {
      let matchingFolder = standaloneFolders.find(f => filePath.startsWith(f));
      if (!matchingFolder) {
        for (const p of projects) {
          const found = p.folders.find(f => filePath.startsWith(f));
          if (found) matchingFolder = found;
        }
      }
      if (matchingFolder) setActiveFolderPath(matchingFolder);

      const content = await readTextFile(filePath);
      const name = filePath.split(/[/\\]/).pop() || "file";
      const ext = name.split('.').pop() || "";
      const lang = ext === "py" ? "python" : ext === "js" ? "javascript" : ext === "cpp" ? "cpp" : ext === "c" ? "c" : "plaintext";
      
      const existing = tabs.find(t => t.path === filePath);
      if (existing) {
        setActiveTabId(existing.id);
      } else {
        const newId = `file-${Date.now()}`;
        setTabs([...tabs, { id: newId, name, path: filePath, content, lang }]);
        setActiveTabId(newId);
      }
    } catch (err) {
      console.error("Failed to read file", err);
    }
  };

  const activeProcessRef = useRef<any>(null);
  const terminalInputHandlerRef = useRef<any>(null);

  const handleRun = async () => {
    setActiveBottomTab("terminal");
    appendOutput(`Executing ${(activeTab?.lang || 'python')} script...`);
    if (getActiveTerminal()) {
      const term = getActiveTerminal();
      term.writeln(`\x1b[1;33m> Executing ${(activeTab?.lang || 'python')} script...\x1b[0m`);
      
      if (!activeTab) return;
      let code = activeTab?.content || '';
      
      try {
        const { appDataDir, join, dirname, basename } = await import("@tauri-apps/api/path");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const { Command } = await import("@tauri-apps/plugin-shell");
        
        // Kill previous running instance and zombies
        if (activeProcessRef.current) {
          try { await activeProcessRef.current.kill(); } catch (e) {}
          activeProcessRef.current = null;
        }
        if (terminalInputHandlerRef.current) {
          terminalInputHandlerRef.current.dispose();
          terminalInputHandlerRef.current = null;
        }
        await Command.create("powershell", ["-Command", "Stop-Process -Name 'scratch.cpp' -Force -ErrorAction SilentlyContinue"]).execute().catch(() => {});
        await Command.create("powershell", ["-Command", "Stop-Process -Name 'scratch.c' -Force -ErrorAction SilentlyContinue"]).execute().catch(() => {});
        await Command.create("powershell", ["-Command", "Stop-Process -Name 'scratch.go' -Force -ErrorAction SilentlyContinue"]).execute().catch(() => {});
        
        let executionPath = activeTab?.path;
        const lang = activeTab?.lang;
        if (!executionPath) {
            const appData = await appDataDir();
            const ext = lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang === 'cpp' ? 'cpp' : lang === 'c' ? 'c' : 'txt';
            executionPath = await join(appData, `scratch.${ext}`);
        }
        await writeTextFile(executionPath, code);
        
        const dir = await dirname(executionPath);
        const file = await basename(executionPath);
        
        let batContent = `@echo off\r\ncd /d "%~dp0"\r\n`;

        if (lang.includes("py")) {
          batContent += `python -u ${file}\r\n`;
        } else if (lang.includes("js") || lang.includes("node")) {
          batContent += `node ${file}\r\n`;
        } else if (lang.includes("rb") || lang.includes("ruby")) {
          batContent += `ruby ${file}\r\n`;
        } else if (lang.includes("go")) {
          batContent += `go run ${file}\r\n`;
        } else if (lang === "c" || lang === "cpp" || lang === "c++") {
          const compiler = lang === "c" ? "gcc" : "g++";
          batContent += `${compiler} ${file} -o ${file}.exe\r\nif %errorlevel% neq 0 ( pause & exit /b %errorlevel% )\r\n${file}.exe\r\n`;
        } else {
          batContent += `${lang} ${file}\r\n`;
        }
        
        batContent += `\r\necho.\r\npause\r\n`;
        
        const batPath = await join(dir, "scratch.bat");
        await writeTextFile(batPath, batContent);
        
        term.writeln(`\r\n\x1b[1;36m> Launching external native terminal for interactive execution...\x1b[0m`);
        
        // Use Windows 'start' to pop open a native cmd window
        const cmd = Command.create("cmd", ["/c", "start", `VoiceIDE Execution`, "cmd", "/c", batPath]);
        
        cmd.on('error', error => term.writeln(`\r\n\x1b[1;31mError launching terminal:\x1b[0m ${error}`));
        
        await cmd.spawn();
      } catch (err) {
        term.writeln(`\r\n\x1b[1;31mExecution setup failed:\x1b[0m ${err}`);
      }
    }
  };

  if (!isBootstrapped) {
    return <Bootstrap onBootstrapped={() => setIsBootstrapped(true)} />;
  }

  return (
    <div className="app-container">
      {activeView === 'profile' ? (
        <ProfilePage 
          onBack={() => setActiveView('ide')}
          userName={userName}
          onUpdateName={handleUpdateName}
          projectsCount={projects.length}
          standaloneFoldersCount={standaloneFolders.length}
          recentProjects={projects.slice(0, 5)}
          aiGenerations={aiGenerations}
          activityLog={activityLog}
          activityDays={activityDays}
          onOpenProject={(id) => {
            setActiveView('ide');
            handleOpenFolder(id);
          }}
        />
      ) : (
        <>
          {/* TITLE BAR */}
      <header className="title-bar">
        <div className="window-controls">
          <div className="dot red"></div>
          <div className="dot yellow"></div>
          <div className="dot green"></div>
          <VscNewFile size={14} className="window-add" onClick={openNewFileModal} />
        </div>
        <div className="tabs-container">
          {tabs.map(tab => (
            <div 
              key={tab.id} 
              className={`tab ${activeTabId === tab.id ? 'active' : 'inactive'}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className={`tab-icon ${tab.lang}`}></span>
              {tab.name}
              <VscClose size={12} className="tab-close" onClick={(e) => closeTab(tab.id, e)} />
            </div>
          ))}
        </div>
        <div className="title-actions">
          <div className="toggle-diff" onClick={() => setShowDiff(!showDiff)} style={{cursor: 'pointer'}}>
            <span className="text">Show difference</span>
            <div className={`toggle-switch ${showDiff ? 'on' : 'off'}`}></div>
          </div>
          <button className="invite-btn">Invite</button>
          <div className="icon-btn"><VscBell size={14} /></div>
          <div className="icon-btn"><VscSettingsGear size={14} /></div>
                    <div className="avatar-btn" onClick={() => setActiveView('profile')} style={{ cursor: 'pointer' }}>
            {userName ? userName.substring(0, 2).toUpperCase() : 'VC'}
          </div>
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="home-btn" onClick={() => setShowCreateProjectModal(true)}>
            <VscFolderOpened size={14} />
            <VscChevronDown size={12} style={{marginLeft: 4}} />
          </div>
          <div className="toolbar-actions">
            <button className="action-btn" onClick={handleRun}>
              <VscPlay size={14} className="action-icon" /> <span className="action-text">Run Code</span>
            </button>
            <button className="action-btn" onClick={handleDebug}>
              <VscBug size={14} className="action-icon" /> <span className="action-text">Debug</span>
            </button>
            <button className="action-btn" onClick={handleOptimize}>
              <VscLightbulb size={14} className="action-icon" /> <span className="action-text">Optimize</span>
            </button>
            <button className="action-btn" onClick={handleTranslate}>
              <VscSymbolString size={14} className="action-icon" /> <span className="action-text">Translate</span>
            </button>
            <button className="action-btn" onClick={handleDocumentation}>
              <VscBook size={14} className="action-icon" /> <span className="action-text">Documentation</span>
            </button>
            <button 
              className={`action-btn record-action ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
              disabled={status === "processing"}
            >
              <VscMic size={14} className="action-icon" /> 
              {status === "idle" ? "Generate Voice Code" : status === "recording" ? "Recording..." : "Processing..."}
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <select 
            className="language-select" 
            value={activeTab?.lang || 'python'} 
            onChange={(e) => {
              const newLang = e.target.value;
              const newExt = newLang === 'python' ? 'py' : newLang === 'javascript' ? 'js' :newLang === 'typescript' ? 'ts'  : newLang === 'cpp' ? 'cpp' : newLang === 'rust' ? 'rs' : newLang === 'c' ? 'c' : newLang;
              setTabs(tabs.map(t => {
                if (t.id === activeTabId) {
                    return {
                      ...t, 
                      lang: newLang,
                      name: !t.path ? (t.name.includes('.') ? t.name.substring(0, t.name.lastIndexOf('.')) + '.' + newExt : t.name + '.' + newExt) : t.name
                    };
                }
                return t;
              }));
            }}
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="cpp">C++</option>
            <option value="c">C</option>
            <option value="go">Go</option>
            <option value="ruby">Ruby</option>
            <option value="rust">Rust</option>
          </select>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-top">
            <button className="create-file-btn" onClick={openNewFileModal}>
              <VscNewFile size={14} style={{marginRight: 6}} /> Create new file
            </button>
            <button className="search-btn"><VscSearch size={14} /></button>
          </div>
          <div className="sidebar-section">
            <div className="section-header">
              <span>Explorer</span>
              <span className="dots">...</span>
            </div>
                          <div className="sidebar-tree">
                {(projects.length > 0 || standaloneFolders.length > 0) ? (
                  <div className="projects-accordion">
                    <div className="projects-accordion-header" style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', color: '#ccc', display: 'flex', alignItems: 'center' }}>
                      <VscChevronDown size={14} style={{ marginRight: 4 }} /> PROJECTS
                    </div>
                    
                    {standaloneFolders.map((path, idx) => (
                        <div 
                          key={path} 
                          className={`folder-root-container ${activeFolderPath === path ? 'active-folder' : ''}`}
                          onClickCapture={() => setActiveFolderPath(path)}
                          style={{ paddingLeft: '8px', paddingBottom: '4px' }}
                        >
                        <FileTree 
                          path={path} 
                          onCloseFolder={() => handleCloseStandaloneFolder(path)}
                          onPathChange={handleStandalonePathChange}
                          onDelete={handleStandaloneDelete}
                          onFileClick={handleFileClick} 
                          refreshTrigger={refreshTrigger} 
                          isRoot={false}
                          startsExpanded={idx === 0 && projects.length === 0} 
                        />
                      </div>
                    ))}
                    
                    {projects.map(proj => (
                      <div key={proj.id} className="project-group">
                        <div 
                          className="project-header" 
                          onClick={() => setExpandedProjects(prev => ({ ...prev, [proj.id]: !prev[proj.id] }))}
                          style={{ padding: '6px 12px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', backgroundColor: expandedProjects[proj.id] ? '#2a2a2a' : 'transparent', fontWeight: 600, color: '#fff' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {expandedProjects[proj.id] ? <VscChevronDown size={14} /> : <VscChevronUp size={14} />}
                            {proj.name}
                          </div>
                          <div className="project-actions" style={{ display: 'flex', gap: '4px' }}>
                            <span onClick={(e) => { e.stopPropagation(); handleOpenFolder(proj.id); }} title="Add Folder" style={{ padding: '2px', opacity: 0.7 }}><VscNewFile size={14} /></span>
                            <span onClick={(e) => { 
                              e.stopPropagation(); 
                              if (confirm('Remove project?')) setProjects(prev => prev.filter(p => p.id !== proj.id));
                            }} title="Remove Project" style={{ padding: '2px', opacity: 0.7, color: '#f44' }}><VscClose size={14} /></span>
                          </div>
                        </div>
                        
                        {expandedProjects[proj.id] && (
                          <div className="file-tree root" style={{ paddingLeft: '8px' }}>
                            {proj.folders.length === 0 ? (
                              <div style={{ padding: '10px', color: '#888', fontStyle: 'italic', fontSize: '12px', textAlign: 'center' }}>No folders added.</div>
                            ) : (
                              proj.folders.map((path, idx) => (
                                <div 
                                  key={path} 
                                  className={`folder-root-container ${activeFolderPath === path ? 'active-folder' : ''}`}
                                  onClickCapture={() => setActiveFolderPath(path)}
                                >
                                  <FileTree 
                                    path={path} 
                                    onCloseFolder={() => handleCloseFolder(proj.id, path)}
                                    onPathChange={handleProjectPathChange}
                                    onDelete={handleProjectDelete}
                                    onFileClick={handleFileClick} 
                                    refreshTrigger={refreshTrigger} 
                                    isRoot={false}
                                    startsExpanded={idx === 0} 
                                  />
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    <div style={{ padding: '10px', display: 'flex', justifyContent: 'center' }}>
                      <button className="welcome-btn" onClick={() => setShowCreateProjectModal(true)} style={{ padding: '6px 12px', fontSize: '12px', width: '90%', borderRadius: '4px', background: '#333', border: '1px dashed #555' }}>
                        <VscNewFile size={14} /> Create Project
                      </button>
                    </div>

                  </div>
                ) : (
                  <div className="empty-sidebar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', gap: '15px' }}>
                    <p style={{ color: '#888', textAlign: 'center', fontSize: '12px', lineHeight: '1.5' }}>No projects or folders open.</p>
                    <button className="welcome-btn" onClick={() => setShowCreateProjectModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '12px', width: '140px', justifyContent: 'center', borderRadius: '6px' }}>
                      <VscNewFile size={14} /> Create Project
                    </button>
                    <button className="welcome-btn" onClick={handleOpenStandaloneFolder} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '12px', width: '140px', justifyContent: 'center', borderRadius: '6px', background: 'transparent' }}>
                      <VscFolderOpened size={14} /> Open Folder
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>
        
        {/* EDITOR & TERMINAL */}
        <div className="editor-terminal-split">
          <div className="editor-pane">
            {activeTab ? (
              <>
                <div className="breadcrumb">
                  project &gt; {activeTab?.path || activeTab?.name || ''}
                </div>
                <div className="editor-wrapper">
                  <div style={{ display: showDiff ? "block" : "none", height: "100%" }}>
                     <DiffEditor
                       height="100%"
                       language={(activeTab?.lang || 'python')}
                       original={activeTab?.content || ''}
                       modified={streamBufferRef.current}
                       theme="vs-dark"
                       onMount={handleDiffEditorDidMount}
                       options={{
                         minimap: { enabled: false },
                         automaticLayout: true,
                         fontSize: 14,
                         lineHeight: 24,
                         padding: { top: 16 }
                       }}
                     />
                  </div>
                  <div style={{ display: showDiff ? "none" : "block", height: "100%" }}>
                     <Editor
                       height="100%"
                       language={(activeTab?.lang || 'python')}
                       value={activeTab?.content || ''}
                       onChange={handleEditorChange}
                       theme="vs-dark"
                       onMount={handleEditorDidMount}
                       options={{
                         minimap: { enabled: false },
                         automaticLayout: true,
                         fontSize: 14,
                         wordWrap: "on",
                         lineHeight: 24,
                         padding: { top: 16 }
                       }}
                     />
                  </div>
                </div>
              </>
            ) : (
              <div className="welcome-screen">
                <div className="welcome-content">
                  <h1 className="welcome-title">VoiceIDE</h1>
                  <p className="welcome-subtitle">Advanced AI Coding Environment</p>
                  <div className="welcome-actions">
                    <button className="welcome-btn" onClick={openNewFileModal}>
                      <VscNewFile size={16} /> New File
                    </button>
                    <button className="welcome-btn" onClick={() => setShowCreateProjectModal(true)}>
                      <VscFolderOpened size={16} /> Open Folder
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className={`terminal-pane ${isTerminalVisible ? 'visible' : 'hidden'}`}>
            <div className="terminal-tabs-bar">
              <div className="terminal-tabs">
                <div 
                  className={`term-tab ${activeBottomTab === 'problems' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('problems')}
                >
                  PROBLEMS {problems.length > 0 && <span className="badge">{problems.length}</span>}
                </div>
                <div 
                  className={`term-tab ${activeBottomTab === 'output' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('output')}
                >
                  OUTPUT
                </div>
                <div 
                  className={`term-tab ${activeBottomTab === 'terminal' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('terminal')}
                >
                  TERMINAL
                </div>
                <div 
                  className={`term-tab ${activeBottomTab === 'debug' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('debug')}
                >
                  DEBUG CONSOLE
                </div>
              </div>
              <div className="terminal-actions">
                <div className="terminal-dropdown-container">
                  <select 
                    className="term-dropdown-select"
                    value={activeTerminalId}
                    onChange={(e) => {
                       setActiveTerminalId(e.target.value);
                       setActiveBottomTab("terminal");
                    }}
                  >
                    {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <VscNewFile size={14} className="term-icon" onClick={createNewTerminal} aria-label="New Terminal" />
                <VscTerminal size={14} className="term-icon" />
                <VscDash size={14} className="term-icon" onClick={deleteTerminal} aria-label="Kill Terminal" />
                {isTerminalVisible ? (<VscChevronDown size={16} className="term-icon" onClick={() => setIsTerminalVisible(false)} aria-label="Hide Panel" />) : (<VscChevronUp size={16} className="term-icon" onClick={() => setIsTerminalVisible(true)} aria-label="Show Panel" />)}
              </div>
            </div>
            <div className="terminal-content" style={{ display: isTerminalVisible ? "" : "none" }}>
              {/* TERMINAL */}
              <div style={{ display: activeBottomTab === "terminal" ? "block" : "none", height: "100%" }}>
                {terminals.map(term => (
                   <div key={term.id} style={{ display: activeTerminalId === term.id ? "block" : "none", height: "100%" }}>
                     <TerminalComponent onRef={(t) => (terminalRefs.current[term.id] = t)} />
                   </div>
                ))}
              </div>
              
              {/* PROBLEMS */}
              <div className="bottom-panel-content" style={{ display: activeBottomTab === "problems" ? "block" : "none" }}>
                {problems.length === 0 ? (
                  <div className="empty-panel">No problems have been detected in the workspace.</div>
                ) : (
                  problems.map((p, i) => (
                    <div key={i} className="problem-row">
                      <span className={`severity-${p.severity}`}>
                        {p.severity === 8 ? "🔴" : p.severity === 4 ? "🟡" : "🔵"}
                      </span>
                      <span className="problem-msg">{p.message}</span>
                      <span className="problem-loc">
                        [{p.startLineNumber}, {p.startColumn}]
                      </span>
                    </div>
                  ))
                )}
              </div>
              
              {/* OUTPUT */}
              <div className="bottom-panel-content" style={{ display: activeBottomTab === "output" ? "block" : "none" }}>
                {outputLogs.map((log, i) => (
                  <div key={i} className="output-row">{log}</div>
                ))}
              </div>
              
              {/* DEBUG CONSOLE */}
              <div className="bottom-panel-content" style={{ display: activeBottomTab === "debug" ? "block" : "none" }}>
                {debugLogs.map((log, i) => (
                  <div key={i} className={`debug-row ${log.startsWith('[ERR]') ? 'error' : log.startsWith('[WARN]') ? 'warn' : ''}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {showCreateProjectModal && (
          <div className="modal-overlay" onClick={() => setShowCreateProjectModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>Create New Project</h3>
              <div className="form-group" style={{marginTop: '15px'}}>
                <label style={{display: 'block', marginBottom: '5px', fontSize: '14px'}}>Project Name</label>
                <input 
                  type="text" 
                  value={newProjectName} 
                  onChange={e => setNewProjectName(e.target.value)} 
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); }}
                  style={{ width: '100%', padding: '8px', background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                />
              </div>
              <div style={{display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end'}}>
                <button className="modal-btn cancel" onClick={() => setShowCreateProjectModal(false)}>Cancel</button>
                <button className="modal-btn primary" onClick={handleCreateProject}>Create</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {showNewFileModal && (
        <div className="modal-overlay" onClick={() => setShowNewFileModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Create New File</h3>
            <form onSubmit={submitNewFile} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <input 
                type="text" 
                className="modal-input" 
                placeholder={`e.g. main.${activeTab?.lang === 'python' ? 'py' : activeTab?.lang === 'cpp' ? 'cpp' : 'js'}`}
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="modal-btn cancel" onClick={() => setShowNewFileModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* STATUS BAR */}
      <footer className="status-bar">
        <div className="status-left">
          <span className="status-item">0 ⚠ 4 ⓧ 0</span>
          <span className="status-item">Live share</span>
        </div>
        <div className="status-middle">
          Auto saved: just now &nbsp;&nbsp;&nbsp; {(activeTab?.lang || 'python').toUpperCase()} 64-bit
        </div>
        <div className="status-right">
          Spaces: 4 &nbsp;&nbsp; UTF-8 &nbsp;&nbsp; CRLF &nbsp;&nbsp; {activeTab?.lang || 'python'}
        </div>
      </footer>
        {showSetupModal && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>👋</div>
              <h2>Welcome to VoiceIDE</h2>
              <p style={{ color: '#888', marginBottom: '30px' }}>Let's get started. What should we call you?</p>
              <input 
                autoFocus
                type="text" 
                placeholder="Enter your name..."
                onKeyDown={e => { if (e.key === 'Enter') handleSaveInitialName(e.currentTarget.value); }}
                style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '8px', fontSize: '16px', marginBottom: '20px' }}
                onBlur={e => handleSaveInitialName(e.target.value)}
              />
              <button className="modal-btn primary" style={{ width: '100%', padding: '12px' }} onClick={(e) => {
                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                handleSaveInitialName(input.value);
              }}>Get Started</button>
            </div>
          </div>
        )}
      </>
      )}
    </div>
  );
}

export default App;

























