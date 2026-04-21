import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Finder } from './pages/Finder';
import { Leads } from './pages/Leads';
import { Templates } from './pages/Templates';
import { Sequences } from './pages/Sequences';
import { Campaigns } from './pages/Campaigns';
import { SmsInbox } from './pages/SmsInbox';
import { Settings } from './pages/Settings';
import { Scraper } from './pages/Scraper';
import { Cockpit } from './pages/Cockpit';
import { Caller } from './pages/Caller';
import { ProspectingScript } from './pages/ProspectingScript';
import { Callbacks } from './pages/Callbacks';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cockpit" element={<Cockpit />} />
          <Route path="/finder" element={<Finder />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/sequences" element={<Sequences />} />
          <Route path="/sms" element={<SmsInbox />} />
          <Route path="/scraper" element={<Scraper />} />
          <Route path="/caller" element={<Caller />} />
          <Route path="/callbacks" element={<Callbacks />} />
          <Route path="/prospecting" element={<ProspectingScript />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
