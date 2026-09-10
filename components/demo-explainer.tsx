'use client';

import {
  BadgeCheck,
  CircleCheckBig,
  ClipboardList,
  Gauge,
  CircleHelp,
  Map,
  MapPinCheck,
  Navigation,
  Play,
  ReceiptText,
  Route,
  SearchCheck,
  Truck,
  Wrench,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const inputs = [
  { icon: Navigation, title: 'Vehicle positions', detail: 'GPS approximately every five minutes' },
  { icon: MapPinCheck, title: 'Customer visits', detail: 'Webfleet confirms presence on site' },
  { icon: ClipboardList, title: 'Open work orders', detail: 'Only state 1 is considered open' },
  { icon: Map, title: 'Customer locations', detail: 'IDs, addresses and coordinates' },
];

const playback = [
  { icon: Play, title: 'Replay the working day', detail: 'Move through time or press play' },
  { icon: Truck, title: 'Follow each vehicle', detail: 'Route, driver, speed and distance' },
  { icon: Wrench, title: 'See work-order context', detail: 'Customer, machine and match status' },
];

const outcomes = [
  { icon: Gauge, title: 'Faster dispatch decisions' },
  { icon: CircleCheckBig, title: 'Visit verification' },
  { icon: SearchCheck, title: 'Visible data-quality gaps' },
  { icon: ReceiptText, title: 'Foundation for time and billing checks' },
];

function StageHeader({ number, children }: { number: number; children: React.ReactNode }) {
  return <div className="explain-stage-header"><span>{number}</span><h3>{children}</h3></div>;
}

export function DemoExplainer() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" className="explainer-trigger" />}>
        <CircleHelp />How this demo works
      </DialogTrigger>
      <DialogContent className="explainer-dialog">
        <DialogHeader className="explainer-heading">
          <p className="eyebrow">G&amp;T Intern Transport · Project Chrono</p>
          <DialogTitle>From vehicle movement to operational action</DialogTitle>
          <DialogDescription>One shared timeline connects what is moving, where technicians actually stop, and which open work needs attention.</DialogDescription>
        </DialogHeader>

        <div className="explainer-flow" aria-label="Four-stage explanation of the work-order playback demo">
          <section className="explain-stage">
            <StageHeader number={1}>Private inputs</StageHeader>
            <div className="explain-list">
              {inputs.map(({ icon: Icon, title, detail }) => <div className="explain-item" key={title}><Icon /><div><strong>{title}</strong><p>{detail}</p></div></div>)}
            </div>
          </section>

          <div className="explain-arrow" aria-hidden="true">→</div>

          <section className="explain-stage explain-engine">
            <StageHeader number={2}>Match &amp; classify</StageHeader>
            <p className="explain-intro">Vehicle names and customer IDs connect the sources for the selected playback date.</p>
            <div className="explain-path explain-path-verified"><BadgeCheck /><div><strong>Verified visit</strong><p>Webfleet confirms the customer and an open work order exists.</p></div></div>
            <div className="explain-path explain-path-likely"><Route /><div><strong>Likely destination</strong><p>No confirmed visit: suggest the nearest mapped open work order within 25 km.</p></div></div>
          </section>

          <div className="explain-arrow" aria-hidden="true">→</div>

          <section className="explain-stage">
            <StageHeader number={3}>Interactive playback</StageHeader>
            <div className="explain-list">
              {playback.map(({ icon: Icon, title, detail }) => <div className="explain-item" key={title}><Icon /><div><strong>{title}</strong><p>{detail}</p></div></div>)}
            </div>
          </section>

          <div className="explain-arrow" aria-hidden="true">→</div>

          <section className="explain-stage explain-value">
            <StageHeader number={4}>Operational value</StageHeader>
            <div className="explain-list">
              {outcomes.map(({ icon: Icon, title }) => <div className="explain-item" key={title}><Icon /><div><strong>{title}</strong></div></div>)}
            </div>
          </section>
        </div>

        <div className="explain-confidence">
          <div><i className="confidence-verified" /><p><strong>Verified means observed</strong><span>Webfleet confirms the visit.</span></p></div>
          <div><i className="confidence-likely" /><p><strong>Likely means suggested</strong><span>Proximity supports a planner’s decision; it does not replace one.</span></p></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
