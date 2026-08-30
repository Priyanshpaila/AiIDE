import { useRef, useState, useEffect } from "react";
import Editor, { DiffEditor, OnMount } from "@monaco-editor/react";
import { useVoiceToCode } from "./hooks/useVoiceToCode";
import Bootstrap from "./Bootstrap";
import TerminalComponent from "./components/Terminal";
import FileTree from "./components/FileTree";
import * as monaco from "monaco-editor";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Terminal as XTerm } from "@xterm/xterm";
import { 
  Play, Mic, FolderOpen, Settings, Bell, 
  ChevronDown, Search, Plus, TerminalSquare, 
  Bug, Zap, Languages, BookOpen, Minus, X
} from "lucide-react";
import "./App.css";

type Tab = {
  id: string;
  name: string;
  path: string;
  content: string;
  lang: string;
};

function App() {
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  
  const [tabs, setTabs] = useState<Tab[]>([{
    id: "scratch-1",
    name: "scratch.py",
    path: "",
    content: "",
    lang: "python"
  }]);
  const [activeTabId, setActiveTabId] = useState<string>("scratch-1");
  const [showDiff, setShowDiff] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const streamBufferRef = useRef<string>("");

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleDiffEditorDidMount: OnMount = (editor) => {
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
    const ext = activeTab.lang === 'python' ? 'py' : activeTab.lang === 'javascript' ? 'js' : activeTab.lang === 'cpp' ? 'cpp' : activeTab.lang === 'c' ? 'c' : activeTab.lang;
    
    if (!fileName.includes('.')) {
      fileName += `.${ext}`;
    }
    
    setShowNewFileModal(false);

    if (folderPaths.length > 0) {
      // Create it in the active file's folder if possible, otherwise the first folder
      let targetFolder = folderPaths[0];
      if (activeTab.path) {
        const matchingFolder = folderPaths.find(p => activeTab.path.startsWith(p));
        if (matchingFolder) targetFolder = matchingFolder;
      }

      try {
        const { join } = await import("@tauri-apps/api/path");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const newPath = await join(targetFolder, fileName);
        await writeTextFile(newPath, "");
        setRefreshTrigger(prev => prev + 1);
        createNewTab(activeTab.lang, "", newPath, fileName);
      } catch (err) {
        console.error("Failed to create file:", err);
      }
    } else {
      createNewTab(activeTab.lang, "", "", fileName);
    }
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== id);
    if (newTabs.length === 0) {
      const defaultTab = { id: "scratch-1", name: "scratch.py", path: "", content: "", lang: "python" };
      setTabs([defaultTab]);
      setActiveTabId("scratch-1");
    } else {
      setTabs(newTabs);
      if (activeTabId === id) setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const { isRecording, status, toggleRecording } = useVoiceToCode(
    () => activeTab.content,
    (code, isComplete, isStart) => {
      if (isStart) {
        streamBufferRef.current = "";
        setShowDiff(true);
      }

      streamBufferRef.current += code;

      if (isComplete) {
        let finalCode = streamBufferRef.current;
        
        const match = finalCode.match(/```([a-zA-Z0-9+-]+)(?:\r?\n)/);
        let detectedLang = activeTab.lang;
        if (match && match[1]) {
          detectedLang = match[1].toLowerCase();
        }
        
        const cleaned = finalCode.replace(/```[a-zA-Z0-9+-]*\r?\n?/g, "").replace(/```/g, "");
        
        if (detectedLang !== activeTab.lang) {
          setShowDiff(false);
          createNewTab(detectedLang, cleaned);
        } else {
          setTabs(prevTabs => prevTabs.map(t => 
            t.id === activeTabIdRef.current ? { ...t, content: cleaned } : t
          ));
          setShowDiff(false);
          
          if (editorRef.current) {
             const model = editorRef.current.getModel();
             if (model) {
                 editorRef.current.executeEdits("voice-to-code", [{
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
    }
  );

  const handleOpenFolder = async () => {
    const selected = await open({ directory: true, multiple: true });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      setFolderPaths(prev => {
        const newPaths = [...prev];
        paths.forEach(p => {
          if (!newPaths.includes(p)) newPaths.push(p);
        });
        return newPaths;
      });
    }
  };

  const handleFileClick = async (filePath: string) => {
    try {
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
    if (terminalRef.current) {
      const term = terminalRef.current;
      term.writeln(`\x1b[1;33m> Executing ${activeTab.lang} script...\x1b[0m`);
      
      let code = activeTab.content;
      
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
        
        let executionPath = activeTab.path;
        const lang = activeTab.lang;
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
      {/* TITLE BAR */}
      <header className="title-bar">
        <div className="window-controls">
          <div className="dot red"></div>
          <div className="dot yellow"></div>
          <div className="dot green"></div>
          <Plus size={14} className="window-add" onClick={openNewFileModal} />
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
              <X size={12} className="tab-close" onClick={(e) => closeTab(tab.id, e)} />
            </div>
          ))}
        </div>
        <div className="title-actions">
          <div className="toggle-diff" onClick={() => setShowDiff(!showDiff)} style={{cursor: 'pointer'}}>
            <span className="text">Show difference</span>
            <div className={`toggle-switch ${showDiff ? 'on' : 'off'}`}></div>
          </div>
          <button className="invite-btn">Invite</button>
          <div className="icon-btn"><Bell size={14} /></div>
          <div className="icon-btn"><Settings size={14} /></div>
          <div className="avatar-btn">J</div>
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="home-btn" onClick={handleOpenFolder}>
            <FolderOpen size={14} />
            <ChevronDown size={12} style={{marginLeft: 4}} />
          </div>
          <div className="toolbar-actions">
            <button className="action-btn" onClick={handleRun}>
              <Play size={12} style={{marginRight: 6}} /> Run Code
            </button>
            <button className="action-btn">
              <Bug size={12} style={{marginRight: 6}} /> Debug
            </button>
            <button className="action-btn">
              <Zap size={12} style={{marginRight: 6}} /> Optimize
            </button>
            <button className="action-btn">
              <Languages size={12} style={{marginRight: 6}} /> Translate
            </button>
            <button className="action-btn">
              <BookOpen size={12} style={{marginRight: 6}} /> Documentation
            </button>
            <button 
              className={`action-btn record-action ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
              disabled={status === "processing"}
            >
              <Mic size={12} style={{marginRight: 6}} /> 
              {status === "idle" ? "Generate Voice Code" : status === "recording" ? "Recording..." : "Processing..."}
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <select 
            className="language-select" 
            value={activeTab.lang} 
            onChange={(e) => {
              const newLang = e.target.value;
              const newExt = newLang === 'python' ? 'py' : newLang === 'javascript' ? 'js' : newLang === 'cpp' ? 'cpp' : newLang === 'c' ? 'c' : newLang;
              setTabs(tabs.map(t => {
                if (t.id === activeTabId) {
                  return {
                    ...t, 
                    lang: newLang,
                    name: !t.path ? `scratch.${newExt}` : t.name
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
              <Plus size={14} style={{marginRight: 6}} /> Create new file
            </button>
            <button className="search-btn"><Search size={14} /></button>
          </div>
          <div className="sidebar-section">
            <div className="section-header">
              <span>Explorer</span>
              <span className="dots">...</span>
            </div>
            <div className="sidebar-tree">
              {folderPaths.length > 0 ? (
                <div className="file-tree root">
                  {folderPaths.map((path, idx) => (
                    <FileTree 
                      key={path} 
                      path={path} 
                      onFileClick={handleFileClick} 
                      refreshTrigger={refreshTrigger} 
                      isRoot={false}
                      startsExpanded={idx === 0} 
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-sidebar">No folder opened</div>
              )}
            </div>
          </div>
        </aside>
        
        {/* EDITOR & TERMINAL */}
        <div className="editor-terminal-split">
          <div className="editor-pane">
            <div className="breadcrumb">
              project &gt; {activeTab.path || activeTab.name}
            </div>
            <div className="editor-wrapper">
              <div style={{ display: showDiff ? "block" : "none", height: "100%" }}>
                 <DiffEditor
                   height="100%"
                   language={activeTab.lang}
                   original={activeTab.content}
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
                   language={activeTab.lang}
                   value={activeTab.content}
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
          </div>
          
          <div className="terminal-pane">
            <div className="terminal-tabs-bar">
              <div className="terminal-tabs">
                <div className="term-tab">PROBLEMS <span className="badge">16</span></div>
                <div className="term-tab">OUTPUT</div>
                <div className="term-tab active">TERMINAL</div>
                <div className="term-tab">DEBUG CONSOLE</div>
              </div>
              <div className="terminal-actions">
                <span className="term-dropdown">1: Node <ChevronDown size={12} style={{marginLeft: 4}} /></span>
                <Plus size={14} className="term-icon" />
                <TerminalSquare size={14} className="term-icon" />
                <Minus size={14} className="term-icon" />
                <X size={14} className="term-icon" />
              </div>
            </div>
            <div className="terminal-content">
              <TerminalComponent onRef={(term) => (terminalRef.current = term)} />
            </div>
          </div>
        </div>
      </main>

      {showNewFileModal && (
        <div className="modal-overlay" onClick={() => setShowNewFileModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Create New File</h3>
            <form onSubmit={submitNewFile} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <input 
                type="text" 
                className="modal-input" 
                placeholder={`e.g. main.${activeTab.lang === 'python' ? 'py' : activeTab.lang === 'cpp' ? 'cpp' : 'js'}`}
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
          Auto saved: just now &nbsp;&nbsp;&nbsp; {activeTab.lang.toUpperCase()} 64-bit
        </div>
        <div className="status-right">
          Spaces: 4 &nbsp;&nbsp; UTF-8 &nbsp;&nbsp; CRLF &nbsp;&nbsp; {activeTab.lang}
        </div>
      </footer>
    </div>
  );
}

export default App;
