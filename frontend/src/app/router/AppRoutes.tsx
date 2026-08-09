import { Navigate, Route, Routes } from 'react-router';

import { AppLayout } from '@app/layouts/AppLayout';

import {
  AuthPage,
  ChainDetailPage,
  ChainListPage,
  ChainParticipantsPage,
  ChainReplacementPage,
  ChangePasswordPage,
  ExchangeRequestsPage,
  ForgotPasswordPage,
  ItemFormPage,
  ProductsPage,
  ProfilePage,
  RequestFormPage,
} from '@pages/index';

import { RedirectIfAuthed } from './RedirectIfAuthed';
import { RequireAuth } from './RequireAuth';

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <AuthPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <AuthPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <RedirectIfAuthed>
            <ForgotPasswordPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<ItemFormPage />} />
        <Route path="/products/:itemId/edit" element={<ItemFormPage />} />
        <Route path="/exchange-requests" element={<ExchangeRequestsPage />} />
        <Route path="/exchange-requests/new" element={<RequestFormPage />} />
        <Route path="/exchange-requests/:requestId/edit" element={<RequestFormPage />} />
        <Route path="/exchange-requests/:requestId" element={<ChainListPage />} />
        <Route path="/chains/:chainId" element={<ChainDetailPage />} />
        <Route path="/chains/:chainId/participants" element={<ChainParticipantsPage />} />
        <Route path="/chains/:chainId/replacement" element={<ChainReplacementPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      {/* смена пароля — отдельный экран без таб-бара/бокового меню (DESIGN.md §4.8) */}
      <Route
        path="/profile/password"
        element={
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  );
}
