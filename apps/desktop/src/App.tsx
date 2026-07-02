import { Routes, Route } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Carros from './pages/Carros';
import Servicos from './pages/Servicos';
import Estoque from './pages/Estoque';
import EmBreve from './pages/EmBreve';

export default function App() {
  const { usuario } = useAuth();
  if (!usuario) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/carros" element={<Carros />} />
        <Route path="/servicos" element={<Servicos />} />
        <Route path="/estoque" element={<Estoque />} />
        <Route path="*" element={<EmBreve />} />
      </Routes>
    </Layout>
  );
}
