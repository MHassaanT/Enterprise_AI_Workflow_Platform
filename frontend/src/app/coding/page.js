"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import { getAuthHeader } from '../../lib/api';

export default function CodingAgentPage() {
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
  const [activeRightTab, setActiveRightTab] = useState('code'); // 'code' | 'diff'
  const chatMessagesRef = useRef(null);

  const API_BASE = '/api/v1/coding';

  // Load repositories on mount
  useEffect(() => {
    fetchRepositories();
  }, []);

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
      if (data.status === 'success' && data.data?.tree) {
        setTree(data.data.tree);
        // Auto select first file if none selected
        const files = data.data.tree.filter(i => i.type === 'file');
        if (files.length > 0 && !selectedFile) {
          fetchFileContent(repo, files[0].path, branch);
        }
      } else {
        setTree([]);
      }
    } catch (err) {
      console.error('Error fetching file tree:', err);
    } finally {
      setTreeLoading(false);
    }
  };

  const fetchFileContent = async (repo, path, branch) => {
    setSelectedFile(path);
    setFileLoading(true);
    try {
      const res = await fetch(`${API_BASE}/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`, {
        headers: { ...getAuthHeader() }
      });
      const data = await res.json();
      if (data.status === 'success' && data.data?.content !== undefined) {
        setFileContent(data.data.content);
      } else {
        setFileContent('// Failed to load file content or file is binary');
      }
    } catch (err) {
      console.error('Error fetching file:', err);
      setFileContent('// Error loading file content');
    } finally {
      setFileLoading(false);
    }
  };

  const handleManualCreateBranch = async () => {
    const branchName = prompt('Enter new branch name (e.g. agent/feature-fix-auth):');
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
        alert(`✅ Created branch '${branchName}'`);
      } else {
        alert(`❌ ${data.error || 'Failed to create branch'}`);
      }
    } catch (err) {
      console.error('Error creating branch:', err);
      alert('Error creating branch');
    }
  };

  const handleManualCreatePR = async () => {
    if (!workingBranch) {
      alert('Please create or work on a separate branch before creating a PR!');
      return;
    }
    const title = prompt('Enter Pull Request Title:', `[AI Coding Agent] Updates for ${selectedRepo}`);
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

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md flex flex-col h-screen overflow-hidden">
        
        {/* Top Navigation Header */}
        <header className="border-b border-outline-variant bg-surface px-lg py-md flex items-center justify-between z-10 flex-shrink-0">
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
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Autonomous repository fetching, branch creation, code editing & PR generation</p>
              </div>
            </div>
          </div>

          {/* Header Quick Status */}
          <div className="flex items-center gap-3">
            <button
              onClick={fetchRepositories}
              className="px-sm py-1 bg-surface border border-outline-variant hover:border-primary rounded-lg text-xs font-semibold text-on-surface flex items-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">refresh</span> Refresh Repos
            </button>
            {workingBranch && (
              <div className="flex items-center gap-2 px-md py-xs bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-emerald-400 text-xs font-mono">
                <span className="material-symbols-outlined text-[16px]">alt_route</span>
                Active Branch: <strong>{workingBranch}</strong>
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

        {/* Split Screen Workspace */}
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
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant px-1">
                    <span className="font-semibold">{msg.role === 'user' ? 'You' : 'Coding Agent'}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[92%] p-md rounded-2xl text-body-sm shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-on-primary rounded-tr-none'
                        : 'bg-surface-container-high border border-outline-variant text-on-surface rounded-tl-none'
                    }`}
                  >
                    <p className="whitespace-pre-wrap m-0">{msg.content}</p>

                    {/* Render Plan Card if generated */}
                    {msg.plan && (
                      <div className="mt-md pt-sm border-t border-outline-variant/60 bg-background/80 rounded-xl p-sm space-y-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">assignment</span> Execution Plan
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-900/30 text-amber-400">
                            Planned
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant font-medium">{msg.plan.summary}</p>
                        
                        <div className="space-y-1">
                          {msg.plan.steps?.map(step => (
                            <div key={step.id} className="flex items-center gap-2 text-xs bg-surface p-2 rounded border border-outline-variant/50">
                              <span className="material-symbols-outlined text-blue-400 text-sm">check_circle_outline</span>
                              <span className="font-semibold text-on-surface">{step.task}:</span>
                              <span className="text-on-surface-variant truncate">{step.description}</span>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => handleSendMessage('Execute plan and open pull request', true)}
                          className="w-full mt-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 shadow"
                        >
                          <span className="material-symbols-outlined text-sm">play_arrow</span> Execute Plan & Open PR
                        </button>
                      </div>
                    )}

                    {/* Render Working Branch Tag */}
                    {msg.working_branch && (
                      <div className="mt-xs text-xs font-mono bg-emerald-950/40 text-emerald-300 px-2 py-1 rounded border border-emerald-800/40 inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">alt_route</span> Branch: {msg.working_branch}
                      </div>
                    )}

                    {/* Render PR Banner if PR opened */}
                    {msg.pr_info && (
                      <div className="mt-sm p-sm bg-purple-950/30 border border-purple-800/50 rounded-xl flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-purple-300">Pull Request Created</span>
                          <span className="text-[11px] text-purple-200">{msg.pr_info.title}</span>
                        </div>
                        <a
                          href={msg.pr_info.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-md transition-colors"
                        >
                          View PR #{msg.pr_info.pr_number}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading indicator during agent reasoning */}
              {agentExecuting && (
                <div className="flex items-center gap-3 p-md bg-surface-container-low border border-outline-variant rounded-xl text-on-surface-variant text-xs animate-pulse">
                  <span className="material-symbols-outlined text-primary text-xl animate-spin">sync</span>
                  <span>Agent is analyzing repo, building plan, and executing edits...</span>
                </div>
              )}
            </div>

            {/* Bottom Message Input Box */}
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
                  placeholder={planMode ? "Describe task (Plan Mode ON)..." : "Describe changes to make in repo..."}
                  className="flex-1 px-md py-sm bg-background border border-outline-variant rounded-xl text-on-surface text-body-sm focus:outline-none focus:border-primary transition-colors"
                  disabled={agentExecuting}
                />
                <button
                  type="submit"
                  disabled={agentExecuting || !inputPrompt.trim()}
                  className="px-md py-sm bg-primary hover:bg-primary/90 text-on-primary font-semibold text-body-sm rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1 shadow"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span> Send
                </button>
              </form>
            </div>
          </section>

          {/* RIGHT PANEL: GitHub Repository & Workspace (7 cols) */}
          <section className="md:col-span-7 flex flex-col h-full bg-background overflow-hidden">
            
            {/* Repository Selector Header Bar */}
            <div className="p-md border-b border-outline-variant bg-surface flex flex-wrap items-center justify-between gap-md flex-shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-[240px]">
                <span className="material-symbols-outlined text-on-surface-variant text-xl">folder_managed</span>
                <select
                  value={selectedRepo}
                  onChange={(e) => {
                    setSelectedRepo(e.target.value);
                    setWorkingBranch('');
                    setSelectedFile(null);
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
              </div>
            </div>
          </section>
        </div>
      </div>
    </AuthGuard>
  );
}
