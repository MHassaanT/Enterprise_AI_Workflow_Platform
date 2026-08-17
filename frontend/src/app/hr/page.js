'use client';
import { useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import RecruitmentTab from './RecruitmentTab';
import EmailIntakeTab from './EmailIntakeTab';
import FutureProspectsTab from './FutureProspectsTab';
import AttendanceTab from './AttendanceTab';
import EmployeesTab from './EmployeesTab';

export default function HRAgentPage() {
  const [activeTab, setActiveTab] = useState('recruitment');

  const tabs = [
    { id: 'recruitment', label: 'Manual Screening', icon: 'upload_file' },
    { id: 'email_intake', label: 'Email Application Intake', icon: 'mark_email_unread' },
    { id: 'future_prospects', label: 'Future Prospects', icon: 'person_search' },
    { id: 'employees', label: 'Team Directory', icon: 'badge' },
    { id: 'attendance', label: 'Attendance', icon: 'how_to_reg' },
  ];

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="border-b border-outline-variant bg-surface px-lg py-md flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-on-surface-variant hover:text-primary transition-colors flex items-center">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">groups</span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">HR Agent</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">Recruitment & Talent Management Platform</p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-surface-container-low p-1.5 rounded-xl border border-outline-variant">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-surface text-primary shadow-sm border border-outline-variant/50'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        {/* Tab Content */}
        <main className="flex-1 flex overflow-hidden">
          {activeTab === 'recruitment' && <RecruitmentTab />}
          {activeTab === 'email_intake' && <EmailIntakeTab />}
          {activeTab === 'future_prospects' && <FutureProspectsTab />}
          {activeTab === 'employees' && <EmployeesTab />}
          {activeTab === 'attendance' && <AttendanceTab />}
        </main>
      </div>
    </AuthGuard>
  );
}
