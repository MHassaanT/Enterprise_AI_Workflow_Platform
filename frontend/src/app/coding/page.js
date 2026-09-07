"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import {
  getAuthHeader,
  fetchReportedIssues,
  triggerIssueInvestigation,
  triggerIssueFix
} from '../../lib/api';

export default function CodingAgentPage() {
  // Mode State: 'workspace' (Chat & Code) | 'issues' (Customer Flagged Issues Pipeline)
  const [workspaceMode, setWorkspaceMode] = useState('workspace');
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [issueFilterStatus, setIssueFilterStatus] = useState('all');
  const [issueSearchQuery, setIssueSearchQuery] = useState('');
  const [fixingIssueId, setFixingIssueId] = useState(null);

  // Repository & GitHub State
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('octocat/Hello-World');
  const [baseBranch, setBaseBranch] = useState('main');
  const [workingBranch, setWorkingBranch] = useState('Branch-for-EAIWP-Coding-Agent');
  const [tree, setTree] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  
  // Agent & Chat State
  const [planMode, setPlanMode] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: 'Hello! I am your AI Coding Agent. Select a GitHub repository from the right panel, toggle Plan Building mode if desired, and tell me what features or fixes you want to implement!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [agentExecuting, setAgentExecuting] = useState(false);
  const [activePlan, setActivePlan] = useState(null);
  const [modifiedFiles, setModifiedFiles] = useState([]);
  const [prInfo, setPrInfo] = useState(null);
  const [activeRightTab, setActiveRightTab] = useState('code'); // 'code' | 'diff' | 'issues'
  const [flaggedIssues, setFlaggedIssues] = useState([]);
  const [flaggedIssuesLoading, setFlaggedIssuesLoading] = useState(false);
  const [investigatingIssueId, setInvestigatingIssueId] = useState(null);
  const chatMessagesRef = useRef(null);

  const API_BASE = '/api/v1/coding';

  // Parse URL query params on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'issues') {
        setWorkspaceMode('issues');
      }
      if (params.get('issueId')) {
        setSelectedIssueId(params.get('issueId'));
      }
    }
  }, []);

  // Load repositories and flagged issues on mount
  useEffect(() => {
    fetchRepositories();
    loadFlaggedIssues();
  }, []);

  // Default selected issue when issues are loaded
  useEffect(() => {
    if (!selectedIssueId && flaggedIssues.length > 0) {
      setSelectedIssueId(flaggedIssues[0].id);
    }
  }, [flaggedIssues, selectedIssueId]);

  // Auto-poll flagged issues when any issue is actively investigating or fixing
  useEffect(() => {
    const hasActive = flaggedIssues.some(
      i => i.investigation_status === 'investigating' || i.status === 'investigating' || i.status === 'fixing'
    );
    if (!hasActive) return;

    const interval = setInterval(() => {
      loadFlaggedIssues();
    }, 4000);

    return () => clearInterval(interval);
  }, [flaggedIssues]);

  const loadFlaggedIssues = async () => {
    setFlaggedIssuesLoading(true);
    try {
      const data = await fetchReportedIssues();
      setFlaggedIssues(data.issues || []);
    } catch (err) {
      console.error('Error loading flagged issues in coding page:', err);
    } finally {
      setFlaggedIssuesLoading(false);
    }
  };

  const handleInvestigateFlaggedIssue = async (issue) => {
    setInvestigatingIssueId(issue.id);
    const repoToUse = selectedRepo || (repositories.length > 0 ? repositories[0].full_name : 'MHassaanT/Enterprise_AI_Workflow_Platform');
    const branchToUse = baseBranch || (repositories.length > 0 ? repositories[0].default_branch : 'main');

    // Optimistically show investigating in local list
    setFlaggedIssues(prev => prev.map(i => i.id === issue.id ? {
      ...i,
      status: 'investigating',
      investigation_status: 'investigating',
      investigation_findings: 'Autonomous codebase investigation in progress. Inspecting repository structure and analyzing root cause...',
    } : i));

    try {
      await triggerIssueInvestigation(issue.id, {
        repo: repoToUse,
        base_branch: branchToUse,
      });
      await loadFlaggedIssues();
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          content: `🔍 Autonomous codebase investigation started for issue: "${issue.title}" in repository \`${repoToUse}\`. Inspecting repo tree, reading candidate files, and analyzing root causes. A human approval request will be submitted upon completion.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error('Error triggering issue investigation from coding page:', err);
    } finally {
      setInvestigatingIssueId(null);
    }
  };

  const handleFixFlaggedIssue = async (issue) => {
    setFixingIssueId(issue.id);
    const repoToUse = issue.investigation_repo || selectedRepo || (repositories.length > 0 ? repositories[0].full_name : 'MHassaanT/Enterprise_AI_Workflow_Platform');
    const branchToUse = issue.investigation_branch || baseBranch || (repositories.length > 0 ? repositories[0].default_branch : 'main');

    // Optimistically show fixing in local list
    setFlaggedIssues(prev => prev.map(i => i.id === issue.id ? {
      ...i,
      status: 'fixing',
      resolution_notes: 'Coding Agent is applying code fix and creating Pull Request on GitHub...',
    } : i));

    setMessages(prev => [
      ...prev,
      {
        id: Date.now(),
        role: 'assistant',
        content: `⚡ Autonomous bug fixing initiated for issue: "${issue.title}". Creating feature branch, editing files to address root cause, and opening Pull Request on GitHub repository \`${repoToUse}\`...`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    try {
      const result = await triggerIssueFix(issue.id, {
        repo: repoToUse,
        base_branch: branchToUse,
      });

      await loadFlaggedIssues();

      if (result.pr_url) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: `🎉 Autonomous fix succeeded! Pull Request #${result.pr_number} opened on branch \`${result.branch}\`:\n\n🔗 ${result.pr_url}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err) {
      console.error('Error triggering fix from coding page:', err);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `⚠️ Error during autonomous fix: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      await loadFlaggedIssues();
    } finally {
      setFixingIssueId(null);
    }
  };

  const handleOpenAnalyzedFile = (filePath) => {
    setSelectedFile(filePath);
    setActiveRightTab('code');
    setWorkspaceMode('workspace');
    fetchFileContent(selectedRepo, filePath, workingBranch || baseBranch);
  };

  // Fetch file tree when repo or branch changes
  useEffect(() => {
    if (selectedRepo) {
      fetchTree(selectedRepo, workingBranch || baseBranch);
    }
  }, [selectedRepo, baseBranch, workingBranch]);

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTo({
        top: chatMessagesRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, activePlan]);

  const fetchRepositories = async () => {
    try {
      const res = await fetch(`${API_BASE}/repos`, {
        headers: { ...getAuthHeader() }
      });
      const data = await res.json();
      if (data.status === 'success' && data.repositories?.length > 0) {
        setRepositories(data.repositories);
        if (!selectedRepo || selectedRepo === 'octocat/Hello-World') {
          setSelectedRepo(data.repositories[0].full_name);
          setBaseBranch(data.repositories[0].default_branch || 'main');
        }
      }
    } catch (err) {
      console.error('Error fetching repositories:', err);
    }
  };

  const fetchTree = async (repo, branch) => {
    setTreeLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tree?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`, {
        headers: { ...getAuthHeader() }
      });
      const data = await res.json();
      if (data.status === 'success' && data.tree) {
        setTree(data.tree.tree || []);
      } else {
        setTree([]);
      }
    } catch (err) {
      console.error('Error fetching file tree:', err);
      setTree([]);
    } finally {
      setTreeLoading(false);
    }
  };

  const fetchFileContent = async (repo, path, branch) => {
    setFileLoading(true);
    setSelectedFile(path);
    try {
      const res = await fetch(`${API_BASE}/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`, {
        headers: { ...getAuthHeader() }
      });
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        setFileContent(data.data.content || '');
      } else {
        setFileContent('// Failed to load file content');
      }
    } catch (err) {
      console.error('Error fetching file content:', err);
      setFileContent('// Error loading file');
    } finally {
      setFileLoading(false);
    }
  };

  const handleManualCreateBranch = async () => {
    const branchName = prompt('Enter new branch name:', `feature/agent-${Date.now()}`);
    if (!branchName) return;

    try {
      const res = await fetch(`${API_BASE}/create-branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          repo: selectedRepo,
          base_branch: baseBranch,
          new_branch: branchName
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setWorkingBranch(branchName);
        alert(`✅ Branch created: ${branchName}`);
        fetchTree(selectedRepo, branchName);
      } else {
        alert(`❌ ${data.error || 'Failed to create branch'}`);
      }
    } catch (err) {
      console.error('Error creating branch:', err);
      alert('Error creating branch');
    }
  };

  const handleManualCreatePR = async () => {
    const title = prompt('Enter PR Title:', `Feature update from ${workingBranch}`);
    if (!title) return;
    const body = prompt('Enter PR Description:', 'Added updates automatically using Enterprise AI Coding Agent.');

    try {
      const res = await fetch(`${API_BASE}/create-pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          repo: selectedRepo,
          title,
          body: body || 'AI generated pull request',
          head_branch: workingBranch,
          base_branch: baseBranch
        })
      });
      const data = await res.json();
      if (data.status === 'success' && data.data?.html_url) {
        setPrInfo(data.data);
        alert(`🎉 Pull Request created successfully!\n${data.data.html_url}`);
      } else {
        alert(`❌ ${data.error || 'Failed to create PR'}`);
      }
    } catch (err) {
      console.error('Error creating PR:', err);
      alert('Error creating PR');
    }
  };

  const handleSendMessage = async (customPrompt = null, forceExecutePlan = false) => {
    const promptToSend = customPrompt || inputPrompt;
    if (!promptToSend.trim() && !forceExecutePlan) return;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customPrompt) setInputPrompt('');
    setAgentExecuting(true);

    try {
      const isExecutingPlannedTask = forceExecutePlan || (planMode && activePlan && promptToSend.toLowerCase().includes('execute'));
      const effectivePlanMode = planMode && !isExecutingPlannedTask;

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          prompt: promptToSend,
          repo: selectedRepo,
          base_branch: baseBranch,
          working_branch: workingBranch,
          plan_mode: effectivePlanMode,
          thread_id: `coding-${selectedRepo.replace('/', '-')}`
        })
      });

      const data = await res.json();

      if (data.status === 'success') {
        if (data.working_branch) {
          setWorkingBranch(data.working_branch);
        }
        if (data.plan) {
          setActivePlan(data.plan);
        }
        if (data.modified_files && data.modified_files.length > 0) {
          setModifiedFiles(prev => [...prev, ...data.modified_files]);
          setActiveRightTab('diff');
        }
        if (data.pr_info) {
          setPrInfo(data.pr_info);
        }

        const agentMsg = {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.message || 'Task processed successfully.',
          plan: data.plan,
          working_branch: data.working_branch,
          modified_files: data.modified_files,
          pr_info: data.pr_info,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, agentMsg]);

        // Refresh tree if files were edited or branch created
        if (data.working_branch || (data.modified_files && data.modified_files.length > 0)) {
          fetchTree(selectedRepo, data.working_branch || baseBranch);
        }
      } else {
        const errorMsg = {
          id: Date.now() + 1,
          role: 'assistant',
          content: `⚠️ Error: ${data.error || 'Failed to complete agent execution.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch (err) {
      console.error('Error running agent chat:', err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: '⚠️ Connectivity error while invoking Coding Agent.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setAgentExecuting(false);
    }
  };

  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'critical': return 'bg-red-950 text-red-300 border-red-800';
      case 'high': return 'bg-orange-950 text-orange-300 border-orange-800';
      case 'medium': return 'bg-amber-950 text-amber-300 border-amber-800';
      default: return 'bg-emerald-950 text-emerald-300 border-emerald-800';
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case 'fixing': return 'bg-blue-950 text-cyan-300 border-cyan-800 animate-pulse';
      case 'investigating': return 'bg-blue-950 text-blue-300 border-blue-800';
      case 'awaiting_review': return 'bg-purple-950 text-purple-300 border-purple-800';
      case 'resolved': return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case 'dismissed': return 'bg-zinc-800 text-zinc-400 border-zinc-700';
      default: return 'bg-amber-950 text-amber-300 border-amber-800';
    }
  };

  const unresolvedCount = flaggedIssues.filter(
    i => ['open', 'investigating', 'awaiting_review', 'fixing'].includes(i.status)
  ).length;

  const filteredIssues = flaggedIssues.filter(issue => {
    if (issueFilterStatus !== 'all' && issue.status !== issueFilterStatus) return false;
    if (issueSearchQuery.trim()) {
      const q = issueSearchQuery.toLowerCase();
      const matchTitle = issue.title?.toLowerCase().includes(q);
      const matchDesc = issue.description?.toLowerCase().includes(q);
      const matchMsg = issue.customer_message?.toLowerCase().includes(q);
      const matchCause = issue.root_cause?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchMsg && !matchCause) return false;
    }
    return true;
  });

  const activeSelectedIssue = flaggedIssues.find(i => i.id === selectedIssueId) || filteredIssues[0] || null;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md flex flex-col h-screen overflow-hidden">
        
        {/* Top Navigation Header with Primary Mode Switcher */}
        <header className="border-b border-outline-variant bg-surface px-lg py-sm flex flex-wrap items-center justify-between z-10 flex-shrink-0 gap-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-on-surface-variant hover:text-primary transition-colors flex items-center">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-950/40 border border-blue-800/50 flex items-center justify-center text-blue-400 shadow">
                <span className="material-symbols-outlined text-[22px]">code</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight flex items-center gap-2">
                  Coding Agent
                  <span className="px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 text-xs font-mono font-semibold">GitHub Engine</span>
                </h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Autonomous repository fetching, root-cause analysis, code editing & PR generation</p>
              </div>
            </div>
          </div>

          {/* PRIMARY WORKSPACE MODE SWITCHER */}
          <div className="flex items-center p-1 bg-background border border-outline-variant rounded-xl shadow-inner">
            <button
              onClick={() => setWorkspaceMode('workspace')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                workspaceMode === 'workspace'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">terminal</span>
              Chat & Code Workspace
            </button>
            <button
              onClick={() => setWorkspaceMode('issues')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                workspaceMode === 'issues'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">bug_report</span>
              Customer Flagged Issues
              {unresolvedCount > 0 && (
                <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                  workspaceMode === 'issues' ? 'bg-white text-amber-700' : 'bg-amber-500 text-white'
                }`}>
                  {unresolvedCount}
                </span>
              )}
            </button>
          </div>

          {/* Header Quick Status */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchRepositories}
              className="px-sm py-1 bg-surface border border-outline-variant hover:border-primary rounded-lg text-xs font-semibold text-on-surface flex items-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">refresh</span> Repos
            </button>
            {workingBranch && (
              <div className="hidden lg:flex items-center gap-2 px-md py-xs bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-emerald-400 text-xs font-mono">
                <span className="material-symbols-outlined text-[16px]">alt_route</span>
                Branch: <strong>{workingBranch}</strong>
              </div>
            )}
            {prInfo && (
              <a
                href={prInfo.html_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-md py-xs bg-purple-950/40 border border-purple-800/50 text-purple-300 rounded-lg text-xs font-semibold hover:bg-purple-900/50 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">call_split</span>
                PR #{prInfo.pr_number} Open
              </a>
            )}
          </div>
        </header>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 1: DEDICATED FULL WORKSPACE FOR CUSTOMER FLAGGED ISSUES       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {workspaceMode === 'issues' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-background">
            
            {/* Summary Metrics & Filter Bar */}
            <div className="px-lg py-xs bg-surface border-b border-outline-variant flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-xl">psychology</span>
                  <span className="font-title-sm font-bold text-on-surface">Escalation & Root-Cause Pipeline</span>
                </div>
                <div className="hidden md:flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-0.5 rounded bg-surface-variant text-on-surface font-mono">
                    Total: <strong>{flaggedIssues.length}</strong>
                  </span>
                  <span className="px-2.5 py-0.5 rounded bg-blue-950 text-blue-300 font-mono border border-blue-800">
                    Investigating: <strong>{flaggedIssues.filter(i => i.status === 'investigating' || i.investigation_status === 'investigating').length}</strong>
                  </span>
                  <span className="px-2.5 py-0.5 rounded bg-purple-950 text-purple-300 font-mono border border-purple-800">
                    Awaiting Review: <strong>{flaggedIssues.filter(i => i.status === 'awaiting_review').length}</strong>
                  </span>
                  <span className="px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono border border-emerald-800">
                    Fixed / PR Open: <strong>{flaggedIssues.filter(i => i.status === 'resolved' || i.pr_url).length}</strong>
                  </span>
                </div>
              </div>

              {/* Filter Controls */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2.5 top-2 text-on-surface-variant text-sm">search</span>
                  <input
                    type="text"
                    placeholder="Search issues, files..."
                    value={issueSearchQuery}
                    onChange={(e) => setIssueSearchQuery(e.target.value)}
                    className="bg-background border border-outline-variant rounded-md pl-8 pr-3 py-1 text-xs text-on-surface focus:outline-none focus:border-primary w-48"
                  />
                </div>

                <select
                  value={issueFilterStatus}
                  onChange={(e) => setIssueFilterStatus(e.target.value)}
                  className="bg-background border border-outline-variant rounded-md px-2.5 py-1 text-xs text-on-surface focus:outline-none focus:border-primary font-medium"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="investigating">Investigating</option>
                  <option value="awaiting_review">Awaiting Review</option>
                  <option value="fixing">Fixing</option>
                  <option value="resolved">Resolved / PR Open</option>
                  <option value="dismissed">Dismissed</option>
                </select>

                <button
                  onClick={loadFlaggedIssues}
                  disabled={flaggedIssuesLoading}
                  className="px-2.5 py-1 bg-surface-variant hover:bg-outline-variant text-xs text-on-surface rounded-md border border-outline-variant flex items-center gap-1 transition-colors"
                >
                  <span className={`material-symbols-outlined text-[14px] ${flaggedIssuesLoading ? 'animate-spin' : ''}`}>refresh</span>
                  Refresh
                </button>

                <Link
                  href="/approvals"
                  className="px-2.5 py-1 bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-700/40 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">gavel</span>
                  Approvals Page
                </Link>
              </div>
            </div>

            {/* Master-Detail Two-Column Layout */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
              
              {/* LEFT COLUMN: Issues Master List (4 cols) */}
              <div className="md:col-span-4 border-r border-outline-variant bg-surface flex flex-col h-full overflow-hidden">
                <div className="px-md py-xs bg-surface-container-low border-b border-outline-variant text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center justify-between">
                  <span>Customer Flagged Issues ({filteredIssues.length})</span>
                  <span className="text-[11px] font-normal lowercase text-on-surface-variant">Escalated from Support Agent</span>
                </div>

                <div className="flex-1 overflow-y-auto p-sm space-y-2">
                  {flaggedIssuesLoading ? (
                    <div className="p-xl text-center text-xs text-on-surface-variant animate-pulse">
                      Loading reported issues...
                    </div>
                  ) : filteredIssues.length === 0 ? (
                    <div className="p-xl text-center text-on-surface-variant text-xs space-y-2">
                      <span className="material-symbols-outlined text-4xl text-amber-400/40 block">check_circle</span>
                      <p className="font-semibold text-on-surface m-0">No Flagged Issues Found</p>
                      <p className="text-[11px] text-on-surface-variant m-0">
                        When the Customer Support Agent cannot resolve an inquiry with documentation or database lookups, it will escalate here for investigation.
                      </p>
                    </div>
                  ) : (
                    filteredIssues.map((issue) => {
                      const isSelected = activeSelectedIssue?.id === issue.id;
                      const isInvestigating = investigatingIssueId === issue.id || issue.investigation_status === 'investigating';
                      const isFixing = fixingIssueId === issue.id || issue.status === 'fixing';

                      return (
                        <div
                          key={issue.id}
                          onClick={() => setSelectedIssueId(issue.id)}
                          className={`p-md rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[#1c2128] border-primary shadow-md ring-1 ring-primary/40'
                              : 'bg-[#161b22] border-[#30363d] hover:border-outline hover:bg-[#1a202c]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="font-bold text-sm text-[#f0f6fc] leading-snug line-clamp-2">
                              {issue.title}
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ${getSeverityBadge(issue.severity)}`}>
                              {issue.severity}
                            </span>
                          </div>

                          {issue.customer_message && (
                            <p className="text-xs text-zinc-300 line-clamp-2 italic mb-2 bg-[#0d1117]/60 p-1.5 rounded border border-[#21262d]">
                              "{issue.customer_message}"
                            </p>
                          )}

                          <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-[#30363d]/60">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getStatusBadge(issue.status)}`}>
                                {issue.status}
                              </span>
                              {issue.pr_url && (
                                <span className="px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 font-mono text-[10px] border border-purple-800 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">call_split</span>
                                  PR #{issue.pr_number || 'open'}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
                              {isInvestigating ? (
                                <span className="text-blue-400 flex items-center gap-1 animate-pulse">
                                  <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                                  Investigating
                                </span>
                              ) : isFixing ? (
                                <span className="text-cyan-400 flex items-center gap-1 animate-pulse">
                                  <span className="material-symbols-outlined text-[13px] animate-spin">build</span>
                                  Fixing & PR
                                </span>
                              ) : (
                                <span>{new Date(issue.created_at).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Active Issue Deep Dive & Live Processing Console (8 cols) */}
              <div className="md:col-span-8 bg-[#0d1117] text-[#c9d1d9] flex flex-col h-full overflow-y-auto">
                {activeSelectedIssue ? (
                  <div className="p-lg space-y-lg">
                    
                    {/* Issue Header Banner */}
                    <div className="p-md bg-[#161b22] border border-[#30363d] rounded-2xl space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 max-w-2xl">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded text-xs font-bold border uppercase ${getSeverityBadge(activeSelectedIssue.severity)}`}>
                              Severity: {activeSelectedIssue.severity}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded text-xs font-bold border uppercase ${getStatusBadge(activeSelectedIssue.status)}`}>
                              Status: {activeSelectedIssue.status}
                            </span>
                            {activeSelectedIssue.category && (
                              <span className="px-2 py-0.5 rounded text-xs font-mono bg-[#21262d] text-zinc-300 border border-[#30363d]">
                                Category: {activeSelectedIssue.category}
                              </span>
                            )}
                          </div>
                          <h2 className="text-xl font-bold text-[#f0f6fc] m-0 leading-snug">
                            {activeSelectedIssue.title}
                          </h2>
                          <p className="text-xs text-zinc-400 font-mono m-0">
                            Issue Reference: <strong>{activeSelectedIssue.id}</strong> • Escalated on {new Date(activeSelectedIssue.created_at).toLocaleString()}
                          </p>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex items-center gap-2">
                          {activeSelectedIssue.status !== 'resolved' && (
                            <button
                              onClick={() => handleInvestigateFlaggedIssue(activeSelectedIssue)}
                              disabled={investigatingIssueId === activeSelectedIssue.id || activeSelectedIssue.investigation_status === 'investigating'}
                              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow"
                            >
                              <span className={`material-symbols-outlined text-[16px] ${investigatingIssueId === activeSelectedIssue.id || activeSelectedIssue.investigation_status === 'investigating' ? 'animate-spin' : ''}`}>
                                {investigatingIssueId === activeSelectedIssue.id || activeSelectedIssue.investigation_status === 'investigating' ? 'sync' : 'search'}
                              </span>
                              {investigatingIssueId === activeSelectedIssue.id || activeSelectedIssue.investigation_status === 'investigating' ? 'Investigating...' : 'Investigate Codebase'}
                            </button>
                          )}

                          {activeSelectedIssue.investigation_status === 'completed' && activeSelectedIssue.status !== 'resolved' && (
                            <button
                              onClick={() => handleFixFlaggedIssue(activeSelectedIssue)}
                              disabled={fixingIssueId === activeSelectedIssue.id || activeSelectedIssue.status === 'fixing'}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-lg"
                            >
                              <span className={`material-symbols-outlined text-[16px] ${fixingIssueId === activeSelectedIssue.id || activeSelectedIssue.status === 'fixing' ? 'animate-spin' : ''}`}>
                                {fixingIssueId === activeSelectedIssue.id || activeSelectedIssue.status === 'fixing' ? 'sync' : 'rocket_launch'}
                              </span>
                              {fixingIssueId === activeSelectedIssue.id || activeSelectedIssue.status === 'fixing' ? 'Generating Fix & PR...' : 'Approve & Open PR'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ═══════════════════════════════════════════════════ */}
                      {/* 4-STAGE LIFECYCLE PROGRESS STEPPER                  */}
                      {/* ═══════════════════════════════════════════════════ */}
                      <div className="pt-3 border-t border-[#30363d]/80">
                        <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          Autonomous Resolution Lifecycle
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          {/* Step 1: Escalated */}
                          <div className="p-2.5 rounded-lg bg-[#0d1117] border border-emerald-800/40 flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-emerald-950 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-800">
                              ✓
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#f0f6fc]">1. Escalated</div>
                              <div className="text-[10px] text-zinc-400">Customer Support Agent</div>
                            </div>
                          </div>

                          {/* Step 2: Investigating */}
                          <div className={`p-2.5 rounded-lg border flex items-center gap-2.5 ${
                            activeSelectedIssue.investigation_status === 'completed'
                              ? 'bg-[#0d1117] border-emerald-800/40'
                              : activeSelectedIssue.investigation_status === 'investigating'
                              ? 'bg-blue-950/30 border-blue-700 animate-pulse'
                              : 'bg-[#0d1117]/60 border-[#30363d]'
                          }`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                              activeSelectedIssue.investigation_status === 'completed'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : activeSelectedIssue.investigation_status === 'investigating'
                                ? 'bg-blue-900 text-blue-300 border border-blue-600'
                                : 'bg-[#21262d] text-zinc-500'
                            }`}>
                              {activeSelectedIssue.investigation_status === 'completed' ? '✓' : '2'}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#f0f6fc]">2. Investigation</div>
                              <div className="text-[10px] text-zinc-400">
                                {activeSelectedIssue.investigation_status === 'completed' ? 'Root Cause Identified' : activeSelectedIssue.investigation_status === 'investigating' ? 'Analyzing Codebase...' : 'Pending Analysis'}
                              </div>
                            </div>
                          </div>

                          {/* Step 3: Human Approval */}
                          <div className={`p-2.5 rounded-lg border flex items-center gap-2.5 ${
                            activeSelectedIssue.status === 'resolved'
                              ? 'bg-[#0d1117] border-emerald-800/40'
                              : activeSelectedIssue.status === 'awaiting_review'
                              ? 'bg-purple-950/30 border-purple-700 ring-1 ring-purple-600/40'
                              : 'bg-[#0d1117]/60 border-[#30363d]'
                          }`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                              activeSelectedIssue.status === 'resolved'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : activeSelectedIssue.status === 'awaiting_review'
                                ? 'bg-purple-900 text-purple-300 border border-purple-600'
                                : 'bg-[#21262d] text-zinc-500'
                            }`}>
                              {activeSelectedIssue.status === 'resolved' ? '✓' : '3'}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#f0f6fc]">3. Human Review</div>
                              <div className="text-[10px] text-zinc-400">
                                {activeSelectedIssue.status === 'resolved' ? 'Approved by Reviewer' : activeSelectedIssue.status === 'awaiting_review' ? 'Ready for Decision' : 'Pending Review'}
                              </div>
                            </div>
                          </div>

                          {/* Step 4: Fix & PR */}
                          <div className={`p-2.5 rounded-lg border flex items-center gap-2.5 ${
                            activeSelectedIssue.status === 'resolved' || activeSelectedIssue.pr_url
                              ? 'bg-emerald-950/30 border-emerald-600 shadow-md'
                              : activeSelectedIssue.status === 'fixing'
                              ? 'bg-cyan-950/30 border-cyan-600 animate-pulse'
                              : 'bg-[#0d1117]/60 border-[#30363d]'
                          }`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                              activeSelectedIssue.status === 'resolved' || activeSelectedIssue.pr_url
                                ? 'bg-emerald-600 text-white font-bold'
                                : activeSelectedIssue.status === 'fixing'
                                ? 'bg-cyan-900 text-cyan-300 border border-cyan-600'
                                : 'bg-[#21262d] text-zinc-500'
                            }`}>
                              {activeSelectedIssue.status === 'resolved' || activeSelectedIssue.pr_url ? '✓' : '4'}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#f0f6fc]">4. Fix & GitHub PR</div>
                              <div className="text-[10px] text-zinc-400">
                                {activeSelectedIssue.pr_url ? `PR #${activeSelectedIssue.pr_number || ''} Open` : activeSelectedIssue.status === 'fixing' ? 'Committing & Opening PR...' : 'Awaiting Approval'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* HERO BANNER: GITHUB PULL REQUEST CREATED */}
                    {(activeSelectedIssue.pr_url || activeSelectedIssue.status === 'resolved') && (
                      <div className="p-md bg-gradient-to-r from-emerald-950/60 via-emerald-900/30 to-[#161b22] border-2 border-emerald-500/60 rounded-2xl space-y-2.5 shadow-xl">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow">
                              <span className="material-symbols-outlined text-[22px]">call_split</span>
                            </div>
                            <div>
                              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 block">
                                Autonomous Fix Applied & PR Created
                              </span>
                              <span className="text-base font-bold text-white">
                                {activeSelectedIssue.pr_number ? `GitHub Pull Request #${activeSelectedIssue.pr_number}` : 'GitHub Pull Request Open'}
                              </span>
                            </div>
                          </div>

                          {activeSelectedIssue.pr_url && (
                            <a
                              href={activeSelectedIssue.pr_url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-lg transition-all"
                            >
                              <span className="material-symbols-outlined text-base">open_in_new</span>
                              View Pull Request on GitHub ↗
                            </a>
                          )}
                        </div>

                        <div className="p-2.5 bg-[#0d1117]/80 rounded-xl border border-emerald-800/40 text-xs font-mono grid grid-cols-1 md:grid-cols-2 gap-2 text-zinc-300">
                          <div>
                            <span className="text-zinc-500 block text-[10px] uppercase">Working Branch</span>
                            <span className="text-emerald-300 font-bold">{activeSelectedIssue.fix_branch || `fix/issue-${activeSelectedIssue.id.substring(0, 8)}`}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[10px] uppercase">Target Repository</span>
                            <span className="text-blue-300">{activeSelectedIssue.investigation_repo || selectedRepo} ({activeSelectedIssue.investigation_branch || 'main'})</span>
                          </div>
                          {activeSelectedIssue.resolution_notes && (
                            <div className="md:col-span-2 pt-1 border-t border-emerald-950/60 font-sans text-xs text-zinc-300">
                              <span className="text-zinc-400 block text-[10px] uppercase font-mono mb-0.5">Resolution Notes</span>
                              {activeSelectedIssue.resolution_notes}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Customer Complaint Card */}
                    <div className="p-md bg-[#161b22] border border-[#30363d] rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[16px] text-amber-400">record_voice_over</span>
                        Customer Complaint
                      </div>
                      <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d] text-sm text-zinc-200 italic leading-relaxed">
                        "{activeSelectedIssue.customer_message || activeSelectedIssue.description}"
                      </div>
                      {activeSelectedIssue.description && activeSelectedIssue.description !== activeSelectedIssue.customer_message && (
                        <div className="text-xs text-zinc-400">
                          <strong>Summary:</strong> {activeSelectedIssue.description}
                        </div>
                      )}
                    </div>

                    {/* Root Cause Analysis & Findings */}
                    <div className="p-md bg-[#161b22] border border-amber-900/50 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                          <span className="material-symbols-outlined text-[18px]">psychology</span>
                          Coding Agent Root Cause Assessment
                        </div>
                        {activeSelectedIssue.investigation_repo && (
                          <span className="text-xs font-mono text-zinc-400 bg-[#0d1117] px-2 py-0.5 rounded border border-[#30363d]">
                            repo: {activeSelectedIssue.investigation_repo} ({activeSelectedIssue.investigation_branch || 'main'})
                          </span>
                        )}
                      </div>

                      {activeSelectedIssue.root_cause ? (
                        <div className="p-3 bg-[#1c2128] border border-amber-800/40 rounded-lg text-sm text-amber-100 whitespace-pre-wrap leading-relaxed">
                          {activeSelectedIssue.root_cause}
                        </div>
                      ) : (
                        <div className="p-3 bg-[#0d1117] rounded-lg text-xs text-zinc-400 italic">
                          {activeSelectedIssue.investigation_status === 'investigating'
                            ? 'Investigation in progress. The Coding Agent is analyzing code patterns...'
                            : 'No root cause analysis generated yet. Click "Investigate Codebase" to start.'}
                        </div>
                      )}

                      {/* Analyzed Target Files */}
                      {activeSelectedIssue.investigated_files && activeSelectedIssue.investigated_files.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-[#30363d]">
                          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                            Identified Target Files ({activeSelectedIssue.investigated_files.length})
                          </span>
                          <div className="grid grid-cols-1 gap-2">
                            {activeSelectedIssue.investigated_files.map((f, idx) => {
                              const filePath = typeof f === 'string' ? f : f.path;
                              const relevance = typeof f === 'object' ? f.relevance : '';
                              return (
                                <div key={idx} className="p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg flex items-center justify-between gap-3">
                                  <div className="font-mono text-xs">
                                    <span className="text-blue-300 font-bold block">{filePath}</span>
                                    {relevance && <span className="text-zinc-400 font-sans text-xs">{relevance}</span>}
                                  </div>
                                  <button
                                    onClick={() => handleOpenAnalyzedFile(filePath)}
                                    className="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] text-xs text-primary rounded border border-[#30363d] flex items-center gap-1 shrink-0 font-semibold transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                    Open in Editor
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Detailed Findings Collapsible */}
                      {activeSelectedIssue.investigation_findings && (
                        <details className="pt-2 border-t border-[#30363d] text-xs">
                          <summary className="text-xs font-bold text-zinc-400 cursor-pointer hover:text-white py-1">
                            View Full Investigation Report
                          </summary>
                          <div className="mt-2 p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-zinc-300 font-mono text-xs whitespace-pre-wrap max-h-60 overflow-y-auto">
                            {activeSelectedIssue.investigation_findings}
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="p-md bg-[#161b22] border border-[#30363d] rounded-xl flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-zinc-400 font-mono">
                        {activeSelectedIssue.status === 'fixing' ? (
                          <span className="text-cyan-400 flex items-center gap-1.5 animate-pulse font-bold">
                            <span className="material-symbols-outlined text-base animate-spin">build</span>
                            Coding Agent is modifying code files and creating Pull Request...
                          </span>
                        ) : activeSelectedIssue.pr_url ? (
                          <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                            <span className="material-symbols-outlined text-base">check_circle</span>
                            Autonomous fix verified on GitHub
                          </span>
                        ) : activeSelectedIssue.status === 'awaiting_review' ? (
                          <span className="text-purple-300 flex items-center gap-1 font-semibold">
                            <span className="material-symbols-outlined text-base">rate_review</span>
                            Awaiting approval. Ready to generate Pull Request.
                          </span>
                        ) : (
                          <span>Ready for investigation and fix execution</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {activeSelectedIssue.approval_id && (
                          <Link
                            href="/approvals"
                            className="px-3 py-1.5 bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-700/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">gavel</span>
                            Approvals Page
                          </Link>
                        )}

                        {activeSelectedIssue.investigation_status === 'completed' && (
                          <button
                            onClick={() => handleFixFlaggedIssue(activeSelectedIssue)}
                            disabled={fixingIssueId === activeSelectedIssue.id || activeSelectedIssue.status === 'fixing'}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow"
                          >
                            <span className={`material-symbols-outlined text-[16px] ${fixingIssueId === activeSelectedIssue.id || activeSelectedIssue.status === 'fixing' ? 'animate-spin' : ''}`}>
                              {fixingIssueId === activeSelectedIssue.id || activeSelectedIssue.status === 'fixing' ? 'sync' : 'rocket_launch'}
                            </span>
                            {activeSelectedIssue.pr_url ? 'Re-generate Fix & PR' : 'Approve & Generate PR'}
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 p-xl text-center">
                    <span className="material-symbols-outlined text-5xl mb-3 text-zinc-600">touch_app</span>
                    <h3 className="text-base font-bold text-zinc-300 mb-1">Select a Reported Issue</h3>
                    <p className="text-xs max-w-sm">
                      Choose an escalated customer issue from the left panel to review root causes, inspect files, or trigger autonomous Pull Request generation.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 2: CHAT & CODE WORKSPACE (CLASSIC SPLIT-SCREEN)              */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {workspaceMode === 'workspace' && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
            
            {/* LEFT SIDEBAR: Agent Chat & Plan Panel (5 cols) */}
            <section className="md:col-span-5 border-r border-outline-variant bg-surface flex flex-col h-full overflow-hidden">
              
              {/* Sidebar Controls Header */}
              <div className="p-md border-b border-outline-variant/60 bg-surface-container-low flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">psychology</span>
                  <span className="font-title-sm text-title-sm text-on-surface font-bold">Agent Assistant</span>
                </div>

                {/* Plan Building Toggle */}
                <div className="flex items-center gap-3 bg-background px-3 py-1.5 rounded-lg border border-outline-variant">
                  <span className="text-xs font-label-md text-on-surface-variant">Plan Building</span>
                  <button
                    type="button"
                    onClick={() => setPlanMode(!planMode)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ${planMode ? 'bg-primary justify-end' : 'bg-outline-variant justify-start'}`}
                  >
                    <span className="w-4 h-4 rounded-full bg-surface shadow-md transform transition-transform" />
                  </button>
                  <span className={`text-xs font-bold ${planMode ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {planMode ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              {/* Quick Action Suggestion Chips */}
              <div className="px-md py-xs bg-background/50 border-b border-outline-variant/40 flex items-center gap-2 overflow-x-auto flex-shrink-0 no-scrollbar">
                <button
                  onClick={() => handleSendMessage('Analyze the codebase and generate an optimization plan', false)}
                  className="px-2.5 py-1 text-xs rounded-full bg-surface border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary whitespace-nowrap transition-colors"
                >
                  ⚡ Generate Plan
                </button>
                <button
                  onClick={() => handleSendMessage('Create a new feature branch and add comprehensive documentation', false)}
                  className="px-2.5 py-1 text-xs rounded-full bg-surface border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary whitespace-nowrap transition-colors"
                >
                  🌿 Add Docs & Branch
                </button>
                <button
                  onClick={() => handleSendMessage('Fix error handling and open a Pull Request', false)}
                  className="px-2.5 py-1 text-xs rounded-full bg-surface border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary whitespace-nowrap transition-colors"
                >
                  🚀 Fix & PR
                </button>
              </div>

              {/* Conversation Log Stream */}
              <div ref={chatMessagesRef} className="flex-1 min-h-0 overflow-y-auto p-md space-y-md">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-xs font-label-md text-on-surface-variant">
                        {msg.role === 'user' ? 'Developer' : 'Coding Agent'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/70">{msg.timestamp}</span>
                    </div>

                    <div
                      className={`p-md rounded-2xl max-w-[90%] text-body-sm shadow-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-primary text-on-primary rounded-tr-xs'
                          : 'bg-surface-variant text-on-surface rounded-tl-xs border border-outline-variant/50'
                      }`}
                    >
                      {msg.content}
                    </div>

                    {/* Embedded Plan Card in Chat */}
                    {msg.plan && (
                      <div className="mt-2 w-full max-w-[90%] bg-surface border border-primary/40 rounded-xl p-md shadow-md">
                        <div className="flex items-center justify-between pb-sm border-b border-outline-variant">
                          <span className="font-bold text-xs text-primary flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">assignment</span> Execution Plan
                          </span>
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-primary-container text-primary font-bold">
                            Planned
                          </span>
                        </div>
                        <p className="text-xs text-on-surface mt-2 mb-2 font-medium">{msg.plan.summary}</p>
                        {msg.plan.target_files && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Target Files:</span>
                            <div className="flex flex-wrap gap-1">
                              {msg.plan.target_files.map((file, fIdx) => (
                                <span key={fIdx} className="px-2 py-0.5 rounded bg-surface-variant text-on-surface font-mono text-[11px] border border-outline-variant">
                                  {file}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-3 pt-sm border-t border-outline-variant flex justify-end">
                          <button
                            onClick={() => handleSendMessage('Execute plan and commit updates', true)}
                            disabled={agentExecuting}
                            className="px-md py-1 bg-primary hover:bg-primary/90 text-on-primary rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">play_arrow</span> Execute Plan
                          </button>
                        </div>
                      </div>
                    )}

                    {/* PR Link in Message if created */}
                    {msg.pr_info && (
                      <div className="mt-2 p-sm bg-purple-950/30 border border-purple-800/40 rounded-xl flex items-center justify-between gap-2 max-w-[90%]">
                        <div className="flex items-center gap-2 text-xs font-mono text-purple-300">
                          <span className="material-symbols-outlined text-base">call_split</span>
                          <span>PR #{msg.pr_info.pr_number}</span>
                        </div>
                        <a
                          href={msg.pr_info.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-purple-400 hover:underline font-bold"
                        >
                          View on GitHub ↗
                        </a>
                      </div>
                    )}
                  </div>
                ))}

                {agentExecuting && (
                  <div className="flex items-center gap-2 p-md bg-surface-variant/40 rounded-xl text-on-surface-variant text-xs animate-pulse">
                    <span className="material-symbols-outlined animate-spin text-base text-primary">sync</span>
                    <span>Coding Agent is analyzing repository, editing code, and verifying commits...</span>
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <div className="p-md border-t border-outline-variant bg-surface flex-shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputPrompt}
                    onChange={(e) => setInputPrompt(e.target.value)}
                    placeholder="Instruct agent to edit code, add features, or open PR..."
                    disabled={agentExecuting}
                    className="flex-1 px-md py-2 bg-background border border-outline-variant rounded-xl text-body-sm text-on-surface focus:outline-none focus:border-primary disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={agentExecuting || !inputPrompt.trim()}
                    className="px-md py-2 bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded-xl disabled:opacity-50 transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-base">send</span>
                  </button>
                </form>
              </div>
            </section>

            {/* RIGHT SIDEBAR: Repository Controls, File Tree & Code/Diff Viewer (7 cols) */}
            <section className="md:col-span-7 flex flex-col h-full overflow-hidden bg-surface">
              
              {/* Repo Selector Header */}
              <div className="p-md border-b border-outline-variant bg-surface-container-low flex flex-wrap items-center justify-between gap-md flex-shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <span className="material-symbols-outlined text-on-surface-variant text-xl">account_tree</span>
                  <select
                    value={selectedRepo}
                    onChange={(e) => {
                      setSelectedRepo(e.target.value);
                      const found = repositories.find(r => r.full_name === e.target.value);
                      if (found) setBaseBranch(found.default_branch || 'main');
                    }}
                    className="flex-1 px-sm py-1.5 bg-background border border-outline-variant rounded-lg text-on-surface font-semibold text-body-sm focus:outline-none focus:border-primary"
                  >
                    {repositories.length > 0 ? (
                      repositories.map(r => (
                        <option key={r.full_name} value={r.full_name}>
                          {r.full_name} ({r.default_branch})
                        </option>
                      ))
                    ) : (
                      <option value={selectedRepo}>{selectedRepo}</option>
                    )}
                  </select>
                </div>

                {/* Branch & Actions Bar */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleManualCreateBranch}
                    className="px-sm py-1.5 bg-surface border border-outline-variant hover:border-primary rounded-lg text-xs font-semibold text-on-surface flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">add_circle</span> New Branch
                  </button>
                  <button
                    onClick={handleManualCreatePR}
                    className="px-sm py-1.5 bg-purple-900/30 border border-purple-700/50 hover:bg-purple-800/40 rounded-lg text-xs font-semibold text-purple-300 flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">call_split</span> Create PR
                  </button>
                </div>
              </div>

              {/* Main Workspace Body: File Tree + Code Editor / Diff Inspector */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
                
                {/* File Explorer Tree (4 cols) */}
                <div className="md:col-span-4 border-r border-outline-variant bg-surface flex flex-col overflow-hidden">
                  <div className="px-md py-xs bg-surface-container-low border-b border-outline-variant text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center justify-between">
                    <span>File Explorer</span>
                    <span className="font-mono text-[10px] bg-background px-1.5 py-0.5 rounded border border-outline-variant">
                      {workingBranch || baseBranch}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-xs space-y-0.5">
                    {treeLoading ? (
                      <div className="p-md text-center text-xs text-on-surface-variant animate-pulse">
                        Loading files...
                      </div>
                    ) : tree.length > 0 ? (
                      tree.map(item => (
                        <button
                          key={item.path}
                          onClick={() => {
                            if (item.type === 'file') {
                              fetchFileContent(selectedRepo, item.path, workingBranch || baseBranch);
                            }
                          }}
                          className={`w-full text-left px-sm py-1.5 rounded text-xs font-mono flex items-center gap-2 truncate transition-colors ${
                            selectedFile === item.path
                              ? 'bg-primary-container/20 text-primary font-bold border-l-2 border-primary'
                              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                          }`}
                        >
                          <span className="material-symbols-outlined text-base shrink-0">
                            {item.type === 'dir' ? 'folder' : 'description'}
                          </span>
                          <span className="truncate">{item.path}</span>
                        </button>
                      ))
                    ) : (
                      <div className="p-md text-center text-xs text-on-surface-variant italic">
                        No files found in repository tree.
                      </div>
                    )}
                  </div>
                </div>

                {/* Code Viewer / Diff Inspector (8 cols) */}
                <div className="md:col-span-8 flex flex-col bg-background overflow-hidden">
                  
                  {/* Code Panel Header Tabs */}
                  <div className="px-md py-xs bg-surface border-b border-outline-variant flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveRightTab('code')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                          activeRightTab === 'code'
                            ? 'bg-primary text-on-primary'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        File Code {selectedFile ? `(${selectedFile.split('/').pop()})` : ''}
                      </button>
                      <button
                        onClick={() => setActiveRightTab('diff')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1 ${
                          activeRightTab === 'diff'
                            ? 'bg-primary text-on-primary'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        Agent Diffs
                        {modifiedFiles.length > 0 && (
                          <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center">
                            {modifiedFiles.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setActiveRightTab('issues')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-1 ${
                          activeRightTab === 'issues'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">bug_report</span>
                        Flagged Issues
                        {unresolvedCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                            {unresolvedCount}
                          </span>
                        )}
                      </button>
                    </div>

                    <span className="text-xs font-mono text-on-surface-variant truncate max-w-[200px]">
                      {selectedFile || 'Select a file'}
                    </span>
                  </div>

                  {/* Code View Tab */}
                  {activeRightTab === 'code' && (
                    <div className="flex-1 overflow-auto p-md font-mono text-xs bg-[#0d1117] text-[#c9d1d9] relative">
                      {fileLoading ? (
                        <div className="h-full flex items-center justify-center text-on-surface-variant animate-pulse">
                          Fetching file content...
                        </div>
                      ) : (
                        <pre className="m-0 leading-relaxed whitespace-pre font-mono">
                          {fileContent || '// Select a file from the left explorer to view code'}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Diff Inspector Tab */}
                  {activeRightTab === 'diff' && (
                    <div className="flex-1 overflow-auto p-md space-y-md bg-[#0d1117] text-[#c9d1d9]">
                      {modifiedFiles.length > 0 ? (
                        modifiedFiles.map((mod, idx) => (
                          <div key={idx} className="border border-[#30363d] rounded-lg overflow-hidden">
                            <div className="bg-[#161b22] px-md py-sm border-b border-[#30363d] flex items-center justify-between text-xs font-mono">
                              <span className="font-bold text-[#58a6ff]">{mod.path}</span>
                              <span className="text-emerald-400 font-semibold">{mod.status}</span>
                            </div>
                            <div className="p-sm text-xs font-mono grid grid-cols-2 gap-sm">
                              <div className="bg-[#1f1618] p-sm rounded border border-red-950">
                                <div className="text-red-400 font-bold mb-1 text-[10px] uppercase">Previous Code</div>
                                <pre className="m-0 text-red-200 whitespace-pre-wrap">{mod.old_code || '(empty)'}</pre>
                              </div>
                              <div className="bg-[#12261e] p-sm rounded border border-emerald-950">
                                <div className="text-emerald-400 font-bold mb-1 text-[10px] uppercase">Updated Agent Code</div>
                                <pre className="m-0 text-emerald-200 whitespace-pre-wrap">{mod.new_code}</pre>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-on-surface-variant text-xs">
                          <span className="material-symbols-outlined text-3xl mb-2">code_off</span>
                          <span>No code edits have been committed by the agent yet.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Flagged Issues Tab (Inner Panel View) */}
                  {activeRightTab === 'issues' && (
                    <div className="flex-1 overflow-auto p-md space-y-md bg-[#0d1117] text-[#c9d1d9]">
                      <div className="flex items-center justify-between pb-sm border-b border-[#30363d]">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-amber-400 text-lg">bug_report</span>
                          <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                            Flagged Customer Issues ({flaggedIssues.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setWorkspaceMode('issues')}
                            className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs rounded border border-amber-500/40 flex items-center gap-1 font-semibold transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">fullscreen</span>
                            Open Dedicated View
                          </button>
                          <button
                            onClick={loadFlaggedIssues}
                            disabled={flaggedIssuesLoading}
                            className="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] text-xs text-[#c9d1d9] rounded border border-[#30363d] flex items-center gap-1 transition-colors"
                          >
                            <span className={`material-symbols-outlined text-[14px] ${flaggedIssuesLoading ? 'animate-spin' : ''}`}>refresh</span>
                          </button>
                        </div>
                      </div>

                      {flaggedIssuesLoading ? (
                        <div className="h-40 flex items-center justify-center text-on-surface-variant text-xs animate-pulse">
                          Loading flagged issues...
                        </div>
                      ) : flaggedIssues.length === 0 ? (
                        <div className="h-60 flex flex-col items-center justify-center text-on-surface-variant text-xs gap-2">
                          <span className="material-symbols-outlined text-4xl text-amber-400/40">task_alt</span>
                          <span className="font-semibold text-on-surface">No Flagged Issues</span>
                          <span className="text-center max-w-sm text-[11px] text-on-surface-variant">
                            When the Customer Support Agent cannot resolve an issue via the KB or database, it automatically flags it here for codebase investigation.
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-sm">
                          {flaggedIssues.map((issue) => {
                            const isInvestigating = investigatingIssueId === issue.id || issue.investigation_status === 'investigating';
                            const isFixing = fixingIssueId === issue.id || issue.status === 'fixing';

                            return (
                              <div key={issue.id} className="p-md bg-[#161b22] border border-[#30363d] rounded-xl space-y-sm">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-sm text-[#f0f6fc]">{issue.title}</span>
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getSeverityBadge(issue.severity)}`}>
                                        {issue.severity}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getStatusBadge(issue.status)}`}>
                                        {issue.status}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-zinc-400 font-mono">
                                      ID: {issue.id.substring(0, 8)} • Reported: {new Date(issue.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>

                                {issue.customer_message && (
                                  <div className="bg-[#0d1117] p-2 rounded-lg border border-[#21262d] text-xs">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">
                                      Customer Complaint
                                    </span>
                                    <p className="text-zinc-200 m-0 italic text-xs">
                                      "{issue.customer_message}"
                                    </p>
                                  </div>
                                )}

                                {issue.root_cause && (
                                  <div className="bg-[#1c2128] p-2 rounded-lg border border-amber-900/40 text-xs">
                                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[13px]">psychology</span>
                                      Root Cause
                                    </span>
                                    <p className="text-amber-100/90 m-0 font-mono text-[11px]">
                                      {issue.root_cause}
                                    </p>
                                  </div>
                                )}

                                {issue.pr_url && (
                                  <div className="p-2 bg-emerald-950/40 border border-emerald-800/50 rounded-lg flex items-center justify-between text-xs">
                                    <span className="text-emerald-300 font-bold flex items-center gap-1">
                                      <span className="material-symbols-outlined text-base">call_split</span>
                                      PR #{issue.pr_number || ''} Open on GitHub
                                    </span>
                                    <a
                                      href={issue.pr_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-emerald-400 hover:underline font-bold"
                                    >
                                      View PR ↗
                                    </a>
                                  </div>
                                )}

                                <div className="pt-2 border-t border-[#21262d] flex items-center justify-between flex-wrap gap-2">
                                  <button
                                    onClick={() => {
                                      setSelectedIssueId(issue.id);
                                      setWorkspaceMode('issues');
                                    }}
                                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                                  >
                                    View Full Pipeline Details →
                                  </button>

                                  <div className="flex items-center gap-2">
                                    {issue.status !== 'resolved' && (
                                      <button
                                        onClick={() => handleInvestigateFlaggedIssue(issue)}
                                        disabled={isInvestigating}
                                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                                      >
                                        <span className={`material-symbols-outlined text-[14px] ${isInvestigating ? 'animate-spin' : ''}`}>
                                          {isInvestigating ? 'sync' : 'search'}
                                        </span>
                                        {isInvestigating ? 'Investigating...' : 'Investigate'}
                                      </button>
                                    )}

                                    {issue.investigation_status === 'completed' && issue.status !== 'resolved' && (
                                      <button
                                        onClick={() => handleFixFlaggedIssue(issue)}
                                        disabled={isFixing}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50 shadow"
                                      >
                                        <span className={`material-symbols-outlined text-[14px] ${isFixing ? 'animate-spin' : ''}`}>
                                          {isFixing ? 'sync' : 'rocket_launch'}
                                        </span>
                                        {isFixing ? 'Fixing...' : 'Open PR'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
