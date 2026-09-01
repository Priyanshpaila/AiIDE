import { useState, useEffect } from "react";
import { readDir, DirEntry, rename, remove } from "@tauri-apps/plugin-fs";
import { join, dirname } from "@tauri-apps/api/path";
import { 
  VscFolder, VscFolderOpened, VscFile, VscEdit, VscTrash,  VscJson
} from "react-icons/vsc";
import { 
  SiPython, SiJavascript, SiTypescript, SiCplusplus, SiHtml5, SiCss, SiMarkdown, 
  SiGnubash, SiReact, SiC
} from "react-icons/si";
import { FaImage } from "react-icons/fa";
import { X } from "lucide-react";
import "./FileTree.css";

interface Props {
  path: string;
  onFileClick: (filePath: string) => void;
  isRoot?: boolean;
  refreshTrigger?: number;
  startsExpanded?: boolean;
  onCloseFolder?: () => void;
  onUpdate?: () => void;
  onPathChange?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
}

function getFileIconInfo(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py': return { icon: <SiPython size={14} />, color: '#3572A5' };
    case 'js': return { icon: <SiJavascript size={14} />, color: '#f1e05a' };
    case 'jsx': return { icon: <SiReact size={14} />, color: '#61dafb' };
    case 'ts': return { icon: <SiTypescript size={14} />, color: '#3178c6' };
    case 'tsx': return { icon: <SiReact size={14} />, color: '#3178c6' };
    case 'cpp': return { icon: <SiCplusplus size={14} />, color: '#f34b7d' };
    case 'c': return { icon: <SiC size={14} />, color: '#555555' };
    case 'html': return { icon: <SiHtml5 size={14} />, color: '#e34c26' };
    case 'css': return { icon: <SiCss size={14} />, color: '#563d7c' };
    case 'json': return { icon: <VscJson size={14} />, color: '#859900' };
    case 'md': return { icon: <SiMarkdown size={14} />, color: '#ffffff' };
    case 'sh':
    case 'bat': return { icon: <SiGnubash size={14} />, color: '#89e051' };
    case 'png':
    case 'jpg':
    case 'svg': return { icon: <FaImage size={14} />, color: '#a074c4' };
    default: return { icon: <VscFile size={14} />, color: '#cccccc' };
  }
}

export default function FileTree({ path, onFileClick, isRoot = true, refreshTrigger = 0, startsExpanded = false, onCloseFolder, onUpdate, onPathChange, onDelete }: Props) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [expanded, setExpanded] = useState<boolean>(isRoot || startsExpanded);
  const [loading, setLoading] = useState<boolean>(false);
  const [name, setName] = useState<string>("");

  const [isHovered, setIsHovered] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    const parts = path.split(/[\\\\/]/);
    setName(parts[parts.length - 1] || path);
    setRenameValue(parts[parts.length - 1] || path);
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
    if (!isRenaming) {
      setExpanded(!expanded);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (renameValue.trim() === name || !renameValue.trim()) {
      setIsRenaming(false);
      return;
    }
    try {
      const parentDir = await dirname(path);
      const newPath = await join(parentDir, renameValue.trim());
      await rename(path, newPath);
      setIsRenaming(false);
      if (onPathChange) onPathChange(path, newPath);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error("Failed to rename folder:", err);
      setIsRenaming(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete folder "' + name + '"?')) {
      try {
        await remove(path, { recursive: true });
        if (onDelete) onDelete(path);
        if (onUpdate) onUpdate();
      } catch (err) {
        console.error("Failed to delete folder:", err);
      }
    }
  };

  if (isRoot) {
    return (
      <div className="file-tree root">
        {entries.map((entry) => (
          <FileTreeNode key={entry.name} entry={entry} parentPath={path} onFileClick={onFileClick} refreshTrigger={refreshTrigger} onUpdate={loadEntries} />
        ))}
      </div>
    );
  }

  return (
    <div className="file-tree-node">
      <div 
        className="file-tree-label" 
        onClick={toggleExpand} 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, overflow: 'hidden' }}>
          <span className="icon" style={{display: 'flex', alignItems: 'center', color: '#c8ff00'}}>
            {expanded ? <VscFolderOpened size={14} /> : <VscFolder size={14} />}
          </span>
          {isRenaming ? (
            <input 
              type="text" 
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit(e);
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              autoFocus
              className="rename-input"
              style={{ background: '#333', color: '#fff', border: '1px solid #007acc', outline: 'none', padding: '0 4px', fontSize: '13px', width: '100%' }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', opacity: (isHovered && !isRenaming) ? 1 : 0, transition: 'opacity 0.1s' }}>
          <span className="action-icon" onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(name); }} title="Rename Folder" style={{ padding: '0 4px', cursor: 'pointer', color: '#ccc' }}>
            <VscEdit size={12} />
          </span>
          <span className="action-icon" onClick={handleDelete} title="Delete Folder" style={{ padding: '0 4px', cursor: 'pointer', color: '#f44' }}>
            <VscTrash size={12} />
          </span>
          {onCloseFolder && (
            <span 
               className="close-folder-icon"
               onClick={(e) => { e.stopPropagation(); onCloseFolder(); }}
               style={{ opacity: 0.7, padding: '0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
               title="Close Folder"
            >
               <X size={14} />
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div className="file-tree-children">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            entries.map((entry) => (
              <FileTreeNode key={entry.name} entry={entry} parentPath={path} onFileClick={onFileClick} refreshTrigger={refreshTrigger} onUpdate={loadEntries} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FileTreeNode({ entry, parentPath, onFileClick, refreshTrigger, onUpdate }: { entry: DirEntry; parentPath: string; onFileClick: (path: string) => void, refreshTrigger?: number, onUpdate: () => void }) {
  const [fullPath, setFullPath] = useState<string>("");
  const [isHovered, setIsHovered] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(entry.name);

  useEffect(() => {
    join(parentPath, entry.name).then(setFullPath);
    setRenameValue(entry.name);
  }, [parentPath, entry.name]);

  if (entry.isDirectory) {
    return <FileTree path={fullPath} onFileClick={onFileClick} isRoot={false} refreshTrigger={refreshTrigger} onUpdate={onUpdate} />;
  }

  const iconInfo = getFileIconInfo(entry.name);

  const handleRenameSubmit = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (renameValue.trim() === entry.name || !renameValue.trim()) {
      setIsRenaming(false);
      return;
    }
    try {
      const newPath = await join(parentPath, renameValue.trim());
      await rename(fullPath, newPath);
      setIsRenaming(false);
      onUpdate();
    } catch (err) {
      console.error("Failed to rename file:", err);
      setIsRenaming(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete file "' + entry.name + '"?')) {
      try {
        await remove(fullPath);
        onUpdate();
      } catch (err) {
        console.error("Failed to delete file:", err);
      }
    }
  };

  return (
    <div 
      className="file-tree-file" 
      onClick={() => { if (!isRenaming && fullPath) onFileClick(fullPath); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, overflow: 'hidden' }}>
        <span className="icon" style={{display: 'flex', alignItems: 'center', color: iconInfo.color}}>
          {iconInfo.icon}
        </span>
        {isRenaming ? (
          <input 
            type="text" 
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit(e);
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            autoFocus
            className="rename-input"
            style={{ background: '#333', color: '#fff', border: '1px solid #007acc', outline: 'none', padding: '0 4px', fontSize: '13px', width: '100%' }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', opacity: (isHovered && !isRenaming) ? 1 : 0, transition: 'opacity 0.1s' }}>
        <span className="action-icon" onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(entry.name); }} title="Rename File" style={{ padding: '0 4px', cursor: 'pointer', color: '#ccc' }}>
          <VscEdit size={12} />
        </span>
        <span className="action-icon" onClick={handleDelete} title="Delete File" style={{ padding: '0 4px', cursor: 'pointer', color: '#f44' }}>
          <VscTrash size={12} />
        </span>
      </div>
    </div>
  );
}