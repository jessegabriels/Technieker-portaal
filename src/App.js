// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import OrderPage from './pages/OrderPage';
import HistoryPage from './pages/HistoryPage';
import PickupsPage from './pages/PickupsPage';
import PlacePage      from './pages/PlacePage';
import BusStockPage   from './pages/BusStockPage';
import ReturnPage     from './pages/ReturnPage';
import AdminUsers from './pages/AdminUsers';
import AdminArticles from './pages/AdminArticles';
import WarehouseStockPage from './pages/WarehouseStockPage';

function RequireAuth({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><span className="spinner" style={{ width: 32, height: 32 }} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/order" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/order" replace /> : <Login />} />

      <Route path="/order" element={
        <RequireAuth><Layout><OrderPage /></Layout></RequireAuth>
      } />

      <Route path="/pickups" element={
        <RequireAuth><Layout><PickupsPage /></Layout></RequireAuth>
      } />

      <Route path="/return" element={
        <RequireAuth><Layout><ReturnPage /></Layout></RequireAuth>
      } />

      <Route path="/busstock" element={
        <RequireAuth><Layout><BusStockPage /></Layout></RequireAuth>
      } />

      <Route path="/place" element={
        <RequireAuth><Layout><PlacePage /></Layout></RequireAuth>
      } />

      <Route path="/history" element={
        <RequireAuth><Layout><HistoryPage /></Layout></RequireAuth>
      } />

      <Route path="/admin/orders" element={
        <RequireAuth adminOnly><Layout><HistoryPage adminView /></Layout></RequireAuth>
      } />

      <Route path="/admin/users" element={
        <RequireAuth adminOnly><Layout><AdminUsers /></Layout></RequireAuth>
      } />

      <Route path="/admin/articles" element={
        <RequireAuth adminOnly><Layout><AdminArticles /></Layout></RequireAuth>
      } />

      <Route path="/admin/warehouse-stock" element={
        <RequireAuth adminOnly><Layout><WarehouseStockPage /></Layout></RequireAuth>
      } />

      <Route path="*" element={<Navigate to={user ? '/order' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
