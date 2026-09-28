import { useState } from 'react';
import { Button } from './Button';
import { isMobileDevice } from '../utils/mobileDetect';

export function IntroScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const isMobile = isMobileDevice();

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[180] bg-black/80 backdrop-blur-xl flex items-center justify-center animate-fade-in">
      <div className="max-w-3xl w-full mx-4">
        <div className="glass-panel p-8 space-y-6 border-future-primary/30">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-3 mb-2">
              <span className="text-4xl">🎬</span>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-future-primary via-future-accent to-future-secondary bg-clip-text text-transparent">
                SkyStudio
              </h1>
            </div>
            <p className="text-lg text-white/70 font-light">
              Create stunning aerial content with cinematic drone flights
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-white/50">
              <span className="flex items-center gap-1">🎥 Cinematic Recording</span>
              <span className="flex items-center gap-1">🌍 Real-World Locations</span>
              <span className="flex items-center gap-1">✨ Professional Output</span>
            </div>
          </div>

          {isMobile ? <MobileControls /> : <DesktopControls />}

          {/* Quick Tips - Updated for content creation */}
          <div className="bg-gradient-to-br from-future-primary/10 to-future-secondary/10 border border-future-primary/20 rounded-xl p-4">
            <h3 className="text-xs uppercase tracking-wider text-future-primary font-semibold mb-2">🚀 Getting Started</h3>
            <ul className="space-y-1.5 text-xs text-white/60">
              {isMobile ? (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-future-accent mt-0.5">✦</span>
                    <span>Use <strong className="text-white/80">Director Mode</strong> to plan cinematic flight paths</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-future-accent mt-0.5">✦</span>
                    <span>Toggle <strong className="text-white/80">Portrait Mode</strong> for social media-ready content</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-future-accent mt-0.5">✦</span>
                    <span>Enable <strong className="text-white/80">Auto-Record</strong> to capture your flights automatically</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-2">
                      <span className="text-future-accent mt-0.5">✦</span>
                      <span>Use <strong className="text-white/80">Director Mode</strong> (left panel) to create waypoint-based flight paths</span>
                  </li>
                  <li className="flex items-start gap-2">
                      <span className="text-future-accent mt-0.5">✦</span>
                      <span>Search any location and add waypoints for your cinematic route</span>
                  </li>
                  <li className="flex items-start gap-2">
                      <span className="text-future-accent mt-0.5">✦</span>
                      <span>Choose between <strong className="text-white/80">Linear</strong>, <strong className="text-white/80">Orbit</strong>, or <strong className="text-white/80">Target Lock</strong> flight modes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-future-accent mt-0.5">✦</span>
                      <span>Press <strong className="text-white/80">C</strong> to cycle camera views for different perspectives</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Start Button */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <Button
              onClick={() => setIsVisible(false)}
              variant="primary"
              size="lg"
              className="px-16 py-4 text-lg font-semibold shadow-glow-lg"
            >
              🎬 Start Creating
            </Button>
            <p className="text-xs text-white/40">No account required • Free to use</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileControls() {
  return (
    <div className="space-y-4">
      {/* Touch Controls */}
      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-white/40 font-semibold">Touch Controls</h3>
        <div className="space-y-2.5">
          <TouchControlRow 
            icon="↔️" 
            action="Swipe Left/Right" 
            description="Roll plane (banking)"
          />
          <TouchControlRow 
            icon="↕️" 
            action="Swipe Up/Down" 
            description="Climb/Descend"
          />
          <TouchControlRow 
            icon="🎚️" 
            action="Right Slider" 
            description="Control speed (throttle)"
          />
        </div>
      </div>
    </div>
  );
}

function DesktopControls() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Flight Controls */}
      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-white/40 font-semibold">Flight</h3>
        <div className="space-y-2">
          <ControlRow keys={['W']} action="Throttle" />
          <ControlRow keys={['S']} action="Brake" />
          <ControlRow keys={['A', 'D', '←', '→']} action="Roll" />
        </div>
      </div>

      {/* System Controls */}
      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-white/40 font-semibold">System</h3>
        <div className="space-y-2">
          <ControlRow keys={['C']} action="Switch Camera" />
          <ControlRow keys={['M']} action="Toggle Mode" />
          <ControlRow keys={['?']} action="Show Controls" />
          <ControlRow keys={['~']} action="Debug Panel" />
        </div>
      </div>
    </div>
  );
}

interface ControlRowProps {
  keys: string[];
  action: string;
}

function ControlRow({ keys, action }: ControlRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex gap-1.5">
        {keys.map((key) => (
          <kbd
            key={key}
            className="px-2 py-1 text-[10px] font-medium text-white bg-white/5 border border-white/10 rounded-lg min-w-[24px] text-center"
          >
            {key}
          </kbd>
        ))}
      </div>
      <span className="text-xs text-white/70 flex-1">{action}</span>
    </div>
  );
}

interface TouchControlRowProps {
  icon: string;
  action: string;
  description: string;
}

function TouchControlRow({ icon, action, description }: TouchControlRowProps) {
  return (
    <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-lg p-3">
      <div className="text-2xl flex-shrink-0">{icon}</div>
      <div className="flex-1 space-y-0.5">
        <div className="text-sm font-medium text-white">{action}</div>
        <div className="text-xs text-white/60">{description}</div>
      </div>
    </div>
  );
}


