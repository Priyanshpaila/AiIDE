import React, { useState, useEffect } from 'react';
import { VscArrowLeft, VscProject, VscFolder, VscFlame, VscSparkle, VscEdit, VscChevronRight, VscCode, VscTools } from 'react-icons/vsc';
import './ProfilePage.css';
import { ActivityLogEntry } from '../App';

interface ProfilePageProps {
  onBack: () => void;
  userName: string;
  onUpdateName: (newName: string) => void;
  projectsCount: number;
  standaloneFoldersCount: number;
  recentProjects: { id: string; name: string }[];
  aiGenerations: number;
  activityLog: ActivityLogEntry[];
  activityDays: Record<string, number>;
  onOpenProject: (projectId: string) => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ 
  onBack, 
  userName, 
  onUpdateName, 
  projectsCount, 
  standaloneFoldersCount,
  recentProjects,
  aiGenerations,
  activityLog,
  activityDays,
  onOpenProject
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(userName);
  const initials = userName ? userName.substring(0, 2).toUpperCase() : 'VC';

  // Calculate day streak
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    let currentStreak = 0;
    const today = new Date();
    // Check up to 365 days backwards
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (activityDays[dateStr] && activityDays[dateStr] > 0) {
        currentStreak++;
      } else if (i !== 0) {
        // Break on the first missing day, except if today is missing (they haven't coded today yet but coded yesterday)
        break;
      }
    }
    setStreak(currentStreak);
  }, [activityDays]);

  // Generate 365 days of real contribution data
  const [contributions, setContributions] = useState<number[]>([]);
  useEffect(() => {
    const data = [];
    const today = new Date();
    // Generate backwards so the end of the array is today
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = activityDays[dateStr] || 0;
      
      // Map raw count to visual levels (0-4)
      let level = 0;
      if (count > 0) level = 1;
      if (count > 2) level = 2;
      if (count > 5) level = 3;
      if (count > 10) level = 4;
      
      data.push(level);
    }
    setContributions(data);
  }, [activityDays]);

  const handleSaveName = () => {
    if (editName.trim()) {
      onUpdateName(editName.trim());
    }
    setIsEditing(false);
  };

  const getLogIcon = (type: string) => {
    if (type === 'code') return <VscCode style={{marginRight: '6px', verticalAlign: 'middle'}}/>;
    if (type === 'project') return <VscProject style={{marginRight: '6px', verticalAlign: 'middle'}}/>;
    return <VscTools style={{marginRight: '6px', verticalAlign: 'middle'}}/>;
  };

  const getTimeAgo = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 2) return 'Yesterday';
    return Math.floor(diff / 86400) + 'd ago';
  };

  return (
    <div className="profile-container">
      <div className="profile-header-bar">
        <button className="back-button" onClick={onBack}>
          <VscArrowLeft /> Back to Workspace
        </button>
      </div>

      <div className="profile-header-main">
        <div className="profile-avatar-large">
          {initials}
        </div>
        <div className="profile-info">
          <h1>
            {isEditing ? (
              <input 
                autoFocus
                type="text" 
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                style={{ background: '#222', color: '#fff', border: '1px solid #c8ff00', borderRadius: '4px', padding: '4px 8px', fontSize: '28px' }}
              />
            ) : (
              <React.Fragment>
                {userName}
                <button className="edit-name-btn" onClick={() => setIsEditing(true)}>
                  <VscEdit />
                </button>
              </React.Fragment>
            )}
          </h1>
          <p>Member since {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <VscFlame className="stat-icon" />
          <div className="stat-value">{streak}</div>
          <div className="stat-label">Day Streak</div>
        </div>
        <div className="stat-card">
          <VscProject className="stat-icon" />
          <div className="stat-value">{projectsCount}</div>
          <div className="stat-label">Total Projects</div>
        </div>
        <div className="stat-card">
          <VscFolder className="stat-icon" />
          <div className="stat-value">{standaloneFoldersCount}</div>
          <div className="stat-label">Standalone Folders</div>
        </div>
        <div className="stat-card">
          <VscSparkle className="stat-icon" />
          <div className="stat-value">{aiGenerations.toLocaleString()}</div>
          <div className="stat-label">AI Generations</div>
        </div>
      </div>

      <h3 className="section-title">Coding Activity</h3>
      <div className="contribution-section">
        {Object.keys(activityDays).length === 0 ? (
           <div className="empty-state" style={{ textAlign: 'center', padding: '40px 0' }}>
             <VscFlame size={32} style={{ color: '#555', marginBottom: '10px' }} />
             <div>No activity recorded yet. Start coding to build your streak!</div>
           </div>
        ) : (
          <div className="contribution-grid-wrapper">
            <div className="contribution-grid">
              {contributions.map((level, i) => (
                <div key={i} className={"contribution-cell level-" + level} title={"Activity level " + level}></div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="two-col-layout">
        <div>
          <h3 className="section-title">Recent Projects</h3>
          <div className="recent-projects-list">
            {recentProjects.length === 0 ? (
              <div className="empty-state">No recent projects found. Open a folder to get started.</div>
            ) : (
              recentProjects.map(proj => (
                <div key={proj.id} className="recent-project-item" onClick={() => onOpenProject(proj.id)}>
                  <div className="project-name-area">
                    <VscProject className="project-icon" />
                    <div className="project-details">
                      <h4>{proj.name}</h4>
                      <p>Workspace Project</p>
                    </div>
                  </div>
                  <button className="launch-btn">Open <VscChevronRight style={{verticalAlign:'middle'}}/></button>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div>
          <h3 className="section-title">Activity Log</h3>
          <div className="activity-log-list">
            {activityLog.length === 0 ? (
              <div className="empty-state">No recent activity. Start coding to build your log!</div>
            ) : (
              activityLog.slice(0, 10).map((log) => (
                <div key={log.id} className="activity-log-item">
                  <div className="activity-log-time">{getTimeAgo(log.timestamp)}</div>
                  <div className="activity-log-content">
                    <h4>{getLogIcon(log.type)}{log.title}</h4>
                    <p>{log.desc}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;