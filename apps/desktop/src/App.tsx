import { Routes, Route } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Carros from './pages/Carros';
import Servicos from './pages/Servicos';
import Estoque from './pages/Estoque';
import Orcamentos from './pages/Orcamentos';
import Ordens from './pages/Ordens';
import Caixa from './pages/Caixa';
import Despesas from './pages/Despesas';
import Contas from './pages/Contas';
import Relatorios from './pages/Relatorios';
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
        <Route path="/orcamentos" element={<Orcamentos />} />
        <Route path="/ordens" element={<Ordens />} />
        <Route path="/caixa" element={<Caixa />} />
        <Route path="/despesas" element={<Despesas />} />
        <Route path="/contas-receber" element={<Contas />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="*" element={<EmBreve />} />
      </Routes>
    </Layout>
  );
}
