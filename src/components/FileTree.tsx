import { useState, useEffect } from "react";
import { readDir, DirEntry } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { FileJson, FileCode, FileText, FileImage, FileTerminal, FileType, Folder, FolderOpen, X } from "lucide-react";
import "./FileTree.css";

interface Props {
  path: string;
  onFileClick: (filePath: string) => void;
  isRoot?: boolean;
  refreshTrigger?: number;
  startsExpanded?: boolean;
}

function getFileIconInfo(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py': return { icon: <FileType size={14} />, color: '#3572A5' };
    case 'js':
    case 'jsx': return { icon: <FileCode size={14} />, color: '#f1e05a' };
    case 'ts':
    case 'tsx': return { icon: <FileCode size={14} />, color: '#2b7489' };
    case 'cpp':
    case 'c': return { icon: <FileCode size={14} />, color: '#f34b7d' };
    case 'html': return { icon: <FileCode size={14} />, color: '#e34c26' };
    case 'css': return { icon: <FileCode size={14} />, color: '#563d7c' };
    case 'json': return { icon: <FileJson size={14} />, color: '#859900' };
    case 'md': return { icon: <FileText size={14} />, color: '#083fa1' };
    case 'sh':
    case 'bat': return { icon: <FileTerminal size={14} />, color: '#89e051' };
    case 'png':
    case 'jpg':
    case 'svg': return { icon: <FileImage size={14} />, color: '#a074c4' };
    default: return { icon: <FileText size={14} />, color: '#ccc' };
  }
}

export default function FileTree({ path, onFileClick, isRoot = true, refreshTrigger = 0, startsExpanded = false, onCloseFolder }: Props) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [expanded, setExpanded] = useState<boolean>(isRoot || startsExpanded);
  const [loading, setLoading] = useState<boolean>(false);
  const [name, setName] = useState<string>("");

  useEffect(() => {
    // Extract folder name from path
    const parts = path.split(/[\\/]/);
    setName(parts[parts.length - 1] || path);
  }, [path]);

  useEffect(() => {
    if (expanded) {
      loadEntries();
    }
  }, [expanded, path, refreshTrigger]);

  async function loadEntries() {
    try {
      setLoading(true);
      const dirs = await readDir(path);
      // Sort: directories first, then alphabetically
      dirs.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(dirs);
    } catch (error) {
      console.error("Failed to read directory", error);
    } finally {
      setLoading(false);
    }
  }

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  if (isRoot) {
    return (
      <div className="file-tree root">
        {entries.map((entry) => (
          <FileTreeNode key={entry.name} entry={entry} parentPath={path} onFileClick={onFileClick} refreshTrigger={refreshTrigger} />
        ))}
      </div>
    );
  }

  return (
    <div className="file-tree-node">
      <div className="file-tree-label" onClick={toggleExpand} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="icon" style={{display: 'flex', alignItems: 'center', color: '#c8ff00'}}>
            {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </span>
          {name}
        </div>
        {onCloseFolder && (
          <span 
             className="close-folder-icon"
             onClick={(e) => { e.stopPropagation(); onCloseFolder(); }}
             style={{ opacity: 0.7, padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
             title="Close Folder"
          >
             <X size={14} />
          </span>
        )}
      </div>
      {expanded && (
        <div className="file-tree-children">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            entries.map((entry) => (
              <FileTreeNode key={entry.name} entry={entry} parentPath={path} onFileClick={onFileClick} refreshTrigger={refreshTrigger} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FileTreeNode({ entry, parentPath, onFileClick, refreshTrigger }: { entry: DirEntry; parentPath: string; onFileClick: (path: string) => void, refreshTrigger?: number }) {
  const [fullPath, setFullPath] = useState<string>("");

  useEffect(() => {
    join(parentPath, entry.name).then(setFullPath);
  }, [parentPath, entry.name]);

  if (entry.isDirectory) {
    return <FileTree path={fullPath} onFileClick={onFileClick} isRoot={false} refreshTrigger={refreshTrigger} />;
  }

  const iconInfo = getFileIconInfo(entry.name);

  return (
    <div className="file-tree-file" onClick={() => fullPath && onFileClick(fullPath)}>
      <span className="icon" style={{display: 'flex', alignItems: 'center', color: iconInfo.color}}>
        {iconInfo.icon}
      </span>
      {entry.name}
    </div>
  );
}


