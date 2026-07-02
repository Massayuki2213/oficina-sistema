import { Routes, Route } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import EmBreve from './pages/EmBreve';

export default function App() {
  const { usuario } = useAuth();
  if (!usuario) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="*" element={<EmBreve />} />
      </Routes>
    </Layout>
  );
}
