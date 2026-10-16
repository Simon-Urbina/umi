import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import EntryForm from '@/components/EntryForm'
import Feed from '@/components/Feed'
import Layout from '@/components/Layout'
import { AuthProvider, RequireAuth } from '@/lib/auth'
import Insights from '@/pages/Insights'
import Login from '@/pages/Login'
import Profile from '@/pages/Profile'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Layout>
                  <div className="flex flex-col gap-14">
                    <EntryForm />
                    <Feed />
                  </div>
                </Layout>
              </RequireAuth>
            }
          />
          <Route path="/patrones" element={<RequireAuth><Insights key="patterns" kind="patterns" /></RequireAuth>} />
          <Route path="/horizonte" element={<RequireAuth><Insights key="horizons" kind="horizons" /></RequireAuth>} />
          <Route path="/quien-soy" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
