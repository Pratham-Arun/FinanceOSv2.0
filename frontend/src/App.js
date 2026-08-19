import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';

// Import Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import SubmitExpense from './pages/SubmitExpense';
import ExpenseDetails from './pages/ExpenseDetails';
import Analytics from './pages/Analytics';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import AIReview from './pages/AIReview';
import AIChatPage from './pages/AIChatPage';
import KnowledgeBase from './pages/KnowledgeBase';
import PolicyManager from './pages/PolicyManager';
import AILogs from './pages/AILogs';
import AIConfigPanel from './pages/AIConfigPanel';
import Invoices from './pages/Invoices';
import SubmitInvoice from './pages/SubmitInvoice';
import InvoiceDetails from './pages/InvoiceDetails';

// Import Components
import AppShell from './components/AppShell';
import FloatingAIChat from './components/FloatingAIChat';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#030712',
        color: '#fff',
        fontFamily: 'sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #1f2937',
            borderTop: '3px solid #6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px auto'
          }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <p style={{ fontSize: '0.9rem', color: '#9ca3af' }}>Validating session credentials...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Authentication routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Application routes wrapped in AppShell */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/expenses" element={<Expenses />} />
                    <Route path="/submit" element={<SubmitExpense />} />
                    <Route path="/expense/:id" element={<ExpenseDetails />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/ai-review" element={<Navigate to="/expenses?tab=high-risk" replace />} />
                    <Route path="/ai-chat" element={<Navigate to="/" replace />} />
                    <Route path="/knowledge" element={<KnowledgeBase />} />
                    <Route path="/policy-rules" element={<PolicyManager />} />
                    <Route path="/ai-logs" element={<AILogs />} />
                    <Route path="/ai-config" element={<AIConfigPanel />} />
                    <Route path="/invoices" element={<Invoices />} />
                    <Route path="/invoices/submit" element={<SubmitInvoice />} />
                    <Route path="/invoice/:id" element={<InvoiceDetails />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                  <FloatingAIChat />
                </AppShell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
