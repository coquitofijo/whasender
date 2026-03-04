import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import ContactLists from './pages/ContactLists';
import Campaigns from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import Autopilot from './pages/Autopilot';

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/contact-lists" element={<ContactLists />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
            <Route path="/autopilot" element={<Autopilot />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;
