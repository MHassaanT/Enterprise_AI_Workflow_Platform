# User Onboarding Flow (/onboard) Implementation Report

**Author:** Enterprise AI Platform Engineering Team  
**Date:** September 1, 2026  
**Status:** Completed & Deployed to Production Build  
**Target Path:** `/onboard`  

---

## 1. Executive Summary

This report documents the architectural design, implementation details, and verification results of the **User Onboarding Flow** (`/onboard`). The onboarding page guides newly registered and subscribed users through the exact setup steps, integrations, and tools required to make their enterprise AI agent workforce operational.

A core pillar of this implementation is **Plan-Filtered Setup Gating**: users only see configuration instructions for the agents included in their active subscription plan (`Basic`, `Pro`, or `Enterprise`).

---

## 2. Business Goals & Objectives

1. **Reduce Time-to-Value**: Provide clear, step-by-step guidance immediately following signup or subscription payment so users can configure their agents within minutes.
2. **Subscription Alignment**: Strictly restrict setup instructions to the agents unlocked by the user's active tier:
   - **Basic Plan**: Customer Support, HR, and PM Agents.
   - **Pro Plan**: Basic Plan + Coding Agent and Workflow Builder Agent.
   - **Enterprise Plan**: Full access to all 9 AI Agents (Customer Support, HR, PM, Coding, Workflow Builder, Sales, Procurement, Finance, Analytics).
3. **Interactive & Frictionless UX**: Allow users to trigger document uploads (Knowledge Base), connect MCP tools (Gmail, Airtable, GitHub), configure the Tools Gateway, and set up chat widgets directly from an interactive checklist.

---

## 3. System Architecture & Component Design

### 3.1 Route Accessibility & Plan Gating

**File:** `frontend/src/lib/planGating.js`

To prevent authenticated users from being blocked by route guards while completing onboarding:
```javascript
export const ALWAYS_ACCESSIBLE_ROUTES = [
  '/dashboard',
  '/onboard',
  '/approvals',
  '/widget-setup',
  '/mcp',
  '/admin/tools',
  '/users',
  '/billing',
  '/subscribe',
  '/attendance',
];
```

### 3.2 Agent Setup Requirements & Configuration Schema

**File:** `frontend/src/app/onboard/page.js`

Each agent features a standardized data model containing an **ID**, **Route**, **Agent Name**, **Badge**, **Single-Line Brief Description**, and **Numbered Requirements/Steps**:

| Agent Name | Description | Required Steps & Tools |
| :--- | :--- | :--- |
| **Chat Support Agent** | Handles customer inquiries, checks order status, and provides 24/7 automated customer support. | 1. Knowledge Base (Document / Link upload)<br>2. Gmail MCP Connection<br>3. Airtable Database Connection<br>4. Tools Gateway (`gmail`, `check_order_status`) configuration<br>5. Widget Setup embed<br>*(Note: Gmail/Airtable/Gateway optional for non-product businesses)* |
| **HR Agent** | Manages employee records, handles policy inquiries, and automates internal HR communications. | 1. Knowledge Base (Document / Link upload)<br>2. Gmail MCP Connection |
| **PM Agent** | Coordinates project tasks, tracks milestones, and automates status reporting. | 1. Knowledge Base (Document / Link upload)<br>2. Gmail MCP Connection |
| **Sales Agent** | Engages prospects, qualifies leads, and manages deal workflows. | 1. Knowledge Base (Document / Link upload)<br>2. Gmail MCP Connection |
| **Procurement Agent** | Handles vendor purchase orders, inventory checks, and approval requests. | 1. Knowledge Base (Document / Link upload)<br>2. Gmail MCP Connection |
| **Finance Agent** | Tracks subscription metrics, processes payments, and generates financial summaries. | *No Configurations needed* (Automated background tracking) |
| **Analytics Agent** | Analyzes operational data, agent execution metrics, and provides real-time performance insights. | *No Configurations needed* (Automated telemetry) |
| **Workflow Builder Agent** | Custom graph orchestrator to connect tools into automated multi-step workflows. | Connect MCP Tools in `/mcp` and compose workflows in `/admin/workflows`. |
| **Coding Agent** | Analyzes codebases, generates pull requests, and automates code reviews. | 1. GitHub MCP Connection (Repo access & PR creation) |

---

## 4. UI / UX Design & Features

### 4.1 Visual Design Language
- **Modern Dark Aesthetics**: Sleek dark mode background with ambient primary radial gradients (`bg-primary/10`), glassmorphic containers (`bg-surface-container-low`), and Material Symbols icons.
- **Status Badges**: Visual indicator tags for agent categories (`Customer Support`, `Human Resources`, `Engineering`, etc.) and real-time state badges (`Ready` ✅ vs `Pending` ⏳).

### 4.2 Interactivity & Convenience
- **Embedded Knowledge Base Modal (`DocumentModal`)**: Clicking *Open Knowledge Base* on any agent card opens the modal in-place so users can drag & drop PDFs/docs or enter website URLs without navigating away.
- **Dynamic Progress Bar**: Tracks completed steps per user (`localStorage` synchronized) and displays an overall percentage progress bar (`X / Y Steps Completed`).
- **Plan Preview Toggle**: Allows users to filter between `Subscribed Agents` (default) and `All 9 Agents` to see upcoming capabilities.
- **Completion Banner**: When all steps for subscribed agents are completed, a success banner appears with a direct CTA to **Go to Workspace Dashboard**.

---

## 5. Flow & Navigation Integration

1. **Sidebar Navigation (`Sidebar.js`)**: Added `Onboarding Setup` (`/onboard`) with icon `rocket_launch` under Dashboard.
2. **Post-Payment Redirect (`payment/success/page.js`)**: Updated payment verification success screen to highlight **Start Agent Onboarding Setup** as the primary call-to-action button.

```
[ Signup / Subscription ]
           │
           ▼
[ SafePay Payment Verification ]
           │
           ▼
 [ /onboard Setup Checklist ] ──(Click 'Open Knowledge Base')──► [ DocumentModal ]
           │                                                            │
           ├─────────► Connect MCP Tools (/mcp) ────────────────────────┘
           │
           ├─────────► Tools Gateway (/admin/tools)
           │
           ▼
[ /dashboard Workspace ]
```

---

## 6. Verification & Build Validation

The codebase was compiled and validated using the Next.js production bundler:

```bash
npx next build
```

**Build Output Verification:**
- `✓ Compiled successfully in 13.8s`
- Static route `/onboard` generated cleanly alongside 31 app routes without TypeScript or syntax warnings.

---

## 7. Conclusion

The `/onboard` page provides a streamlined, plan-gated onboarding experience that simplifies agent configuration, accelerates platform adoption, and reinforces subscription tier value.
