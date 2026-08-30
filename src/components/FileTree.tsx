import { useState, useEffect } from "react";
import { readDir, DirEntry } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import "./FileTree.css";

interface Props {
  path: string;
  onFileClick: (filePath: string) => void;
  isRoot?: boolean;
  refreshTrigger?: number;
  startsExpanded?: boolean;
}

export default function FileTree({ path, onFileClick, isRoot = true, refreshTrigger = 0, startsExpanded = false }: Props) {
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
      <div className="file-tree-label" onClick={toggleExpand}>
        <span className="icon">{expanded ? "📂" : "📁"}</span>
        {name}
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

  return (
    <div className="file-tree-file" onClick={() => fullPath && onFileClick(fullPath)}>
      <span className="icon">📄</span>
      {entry.name}
    </div>
  );
}
