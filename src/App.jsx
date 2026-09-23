import { BrowserRouter, Routes, Route } from "react-router-dom";
import BigBossPrototype, { PublicProposalPage, PublicPresentationPage, PublicLinkPage, PublicGrowthMapPage } from "./BigBossPrototype.jsx";
import { PublicFormPage } from "./modules/forms/FormsModule.jsx";
import { PublicBookingPage } from "./modules/booking/BookingModule.jsx";
import SignupPage from "./modules/billing/SignupPage.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/proposta/:slug" element={<PublicProposalPage />} />
        <Route path="/apresentacao/:id" element={<PublicPresentationPage />} />
        <Route path="/link/:slug" element={<PublicLinkPage />} />
        <Route path="/mapa/:slug" element={<PublicGrowthMapPage />} />
        <Route path="/formulario/:slug" element={<PublicFormPage />} />
        <Route path="/agendar/:slug" element={<PublicBookingPage />} />
        <Route path="/registar" element={<SignupPage />} />
        <Route path="*" element={<BigBossPrototype />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
