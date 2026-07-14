import { useState } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { motion } from 'framer-motion';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LocationProvider } from './hooks/useGeolocation';
import { UnitsProvider } from './hooks/useUnits';
import { TopBar } from './components/TopBar';
import { AddFab } from './components/AddFab';
import { AddPlaceModal } from './components/AddPlaceModal';
import { GlobeIntro } from './components/GlobeIntro';
import AuthPage from './pages/AuthPage';
import PassportPage from './pages/PassportPage';
import CategoryExplorePage from './pages/CategoryExplorePage';
import PlaceDetailPage from './pages/PlaceDetailPage';
import ProfilePage from './pages/ProfilePage';
import GalleryPage from './pages/GalleryPage';

function Shell() {
  const { user, loading } = useAuth();
  const [showIntro, setShowIntro] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <motion.p
          className="font-display text-xl text-ink-soft"
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          StampQuest
        </motion.p>
      </div>
    );
  }
  // Unauthenticated visitors land on the login screen; everyone else sees
  // the passport home page below.
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <div className="mx-auto min-h-dvh max-w-md pt-16 pb-28">
      {showIntro && <GlobeIntro onDone={() => setShowIntro(false)} />}
      <TopBar />
      <Outlet />
      <AddFab onClick={() => setAddOpen(true)} />
      <AddPlaceModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <UnitsProvider>
        <LocationProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route element={<Shell />}>
              <Route index element={<PassportPage />} />
              <Route path="landmarks" element={<CategoryExplorePage key="landmark" category="landmark" />} />
              <Route path="cities" element={<CategoryExplorePage key="city" category="city" />} />
              <Route path="us-states" element={<CategoryExplorePage key="us-state" category="us-state" />} />
              <Route path="place/:id" element={<PlaceDetailPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </LocationProvider>
      </UnitsProvider>
    </AuthProvider>
  );
}
