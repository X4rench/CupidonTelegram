// ═══════════════════════════════════════════════════════════════
// Cupidon TMA — root component с роутингом.
//
// Структура навигации:
//   Bottom tabs: Home, Wing, Simulator, Theory, Profile
//   Stack-routes (без таб-бара): SimulatorChat, FirstMessage, Rejection,
//   CreateGirl, EditProfile, Paywall, Promo, Referral, Settings, Tutorial,
//   Community, AllDialogs, Admin, Terms, Privacy, ThemeScreen.
//
// Все 30+ экранов — реальные компоненты. Phase A-K + L готовы.
// Остался только Phase I (ЮКасса — требует договора, не критично для Stars-only старта).
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { MeProvider, useMe } from './contexts/MeContext';
import { PaywallProvider } from './contexts/PaywallContext';
import { BottomTabBar } from './components/BottomTabBar';

// Phase E
import { HomeScreen } from './screens/HomeScreen';
import { SplashScreen } from './screens/SplashScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { QuestionnaireScreen } from './screens/QuestionnaireScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { EditProfileScreen } from './screens/EditProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DeleteProfileScreen } from './screens/DeleteProfileScreen';

// Phase F
import { WingScreen } from './screens/WingScreen';
import { TheoryScreen } from './screens/TheoryScreen';
import { CommunityScreen } from './screens/CommunityScreen';
import { PostDetailScreen } from './screens/PostDetailScreen';
import { TutorialScreen } from './screens/TutorialScreen';

// Phase G
import { SimulatorScreen } from './screens/SimulatorScreen';
import { SimulatorChatScreen } from './screens/SimulatorChatScreen';
import { SimulatorResultScreen } from './screens/SimulatorResultScreen';
import { AllDialogsScreen } from './screens/AllDialogsScreen';
import { CreateGirlScreen } from './screens/CreateGirlScreen';
import { CreateGirlChatScreen } from './screens/CreateGirlChatScreen';
import { FirstMessageScreen } from './screens/FirstMessageScreen';
import { RejectionScreen } from './screens/RejectionScreen';
import { SupportScreen } from './screens/SupportScreen';

// Phase H
import { PaywallScreen } from './screens/PaywallScreen';
import { PromoCodeScreen } from './screens/PromoCodeScreen';
import { ReferralScreen } from './screens/ReferralScreen';

// Phase J
import { TermsScreen } from './screens/TermsScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';
import { AdminScreen } from './screens/AdminScreen';
import { ThemeScreen } from './screens/ThemeScreen';

// Phase L — Partner program
import { PartnerCabinetScreen } from './screens/PartnerCabinetScreen';
import { AdminPartnerDetailScreen } from './screens/AdminPartnerDetailScreen';
import { AdminChartScreen } from './screens/AdminChartScreen';

export default function App() {
  return (
    <MeProvider>
      <PaywallProvider>
        <BrowserRouter>
          <AuthGate />
          <Routes>
            {/* Splash — точка входа (после initData ок). Сам редиректит дальше. */}
            <Route path="/splash" element={<SplashScreen />} />

            {/* Табы — отображают BottomTabBar */}
            <Route path="/"          element={<HomeScreen />} />
            <Route path="/wing"      element={<WingScreen />} />
            <Route path="/simulator" element={<SimulatorScreen />} />
            <Route path="/theory"    element={<TheoryScreen />} />
            <Route path="/profile"   element={<ProfileScreen />} />

            {/* Auth / onboarding flow */}
            <Route path="/onboarding"    element={<OnboardingScreen />} />
            <Route path="/questionnaire" element={<QuestionnaireScreen />} />

            {/* Stack-экраны (без таб-бара) */}
            <Route path="/simulator/chat/:id"   element={<SimulatorChatScreen />} />
            <Route path="/simulator/result/:id" element={<SimulatorResultScreen />} />
            <Route path="/create-girl"          element={<CreateGirlScreen />} />
            <Route path="/create-girl/chat/:girlId" element={<CreateGirlChatScreen />} />
            <Route path="/all-dialogs"          element={<AllDialogsScreen />} />
            <Route path="/first-message"        element={<FirstMessageScreen />} />
            <Route path="/rejection"            element={<RejectionScreen />} />
            <Route path="/support"              element={<SupportScreen />} />
            <Route path="/community"            element={<CommunityScreen />} />
            <Route path="/post/:slug"           element={<PostDetailScreen />} />
            <Route path="/tutorial"             element={<TutorialScreen />} />
            <Route path="/paywall"              element={<PaywallScreen />} />
            <Route path="/promo"                element={<PromoCodeScreen />} />
            <Route path="/referral"             element={<ReferralScreen />} />
            <Route path="/settings"             element={<SettingsScreen />} />
            <Route path="/edit-profile"         element={<EditProfileScreen />} />
            <Route path="/delete-profile"       element={<DeleteProfileScreen />} />
            <Route path="/theme"                element={<ThemeScreen />} />
            <Route path="/terms"                element={<TermsScreen />} />
            <Route path="/privacy"              element={<PrivacyScreen />} />
            <Route path="/admin"                element={<AdminScreen />} />
            <Route path="/admin/partners"       element={<AdminScreen />} />
            <Route path="/admin/partners/:id"   element={<AdminPartnerDetailScreen />} />
            <Route path="/admin/chart/:metric"                element={<AdminChartScreen />} />
            <Route path="/admin/partners/:id/chart/:metric"   element={<AdminChartScreen />} />
            <Route path="/partner-cabinet"      element={<PartnerCabinetScreen />} />

            {/* 404 fallback */}
            <Route path="*" element={<HomeScreen />} />
          </Routes>

          <TabRouteAwareTabBar />
        </BrowserRouter>
      </PaywallProvider>
    </MeProvider>
  );
}

// Показывать TabBar только на таб-роутах. Stack-роуты (full-screen) — без таб-бара.
function TabRouteAwareTabBar() {
  const location = useLocation();
  const tabPaths = new Set(['/', '/wing', '/simulator', '/theory', '/profile']);
  if (!tabPaths.has(location.pathname)) return null;
  return <BottomTabBar />;
}

// Auth/onboarding gate: первый рендер — если юзер не прошёл онбординг/анкету,
// уводим его на нужный экран. Срабатывает один раз, после загрузки /me.
function AuthGate() {
  const { me, loading } = useMe();
  const nav = useNavigate();
  const location = useLocation();
  const redirected = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (redirected.current) return;
    if (!me) return; // /me упал — UI всё равно покажется (free-режим)

    // Не редиректим если юзер уже на splash/onboarding/questionnaire/tutorial
    const skipPaths = new Set(['/onboarding', '/questionnaire', '/splash', '/tutorial']);
    if (skipPaths.has(location.pathname)) return;

    if (!me.onboarding_done) {
      redirected.current = true;
      nav('/onboarding', { replace: true });
    } else if (!me.questionnaire_done) {
      redirected.current = true;
      nav('/questionnaire', { replace: true });
    } else if (!me.tutorial_done) {
      // Туториал проигрывается ОДИН раз — после онбординга+анкеты.
      // tutorial_done выставляется при «Готово»/«Пропустить» в TutorialScreen.
      redirected.current = true;
      nav('/tutorial', { replace: true });
    }
  }, [loading, me, nav, location.pathname]);

  return null;
}
