'use client';

import React from 'react';
import { reportIncident } from '@/lib/reportIncident';
import { ClientIncidentFallback } from '@/components/incidents/ClientIncidentFallback';

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean; message: string; stack?: string; componentStack?: string }
> {
  state = { failed: false, message: '', stack: undefined, componentStack: undefined };

  static getDerivedStateFromError(error: Error) {
    return {
      failed: true,
      message: error.message || 'React render failure',
      stack: error.stack,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? undefined });
    void reportIncident({
      source: 'client',
      severity: 'high',
      message: error.message || 'React render failure',
      stack: error.stack,
      context: { componentStack: info.componentStack },
      admin_action: 'Auto-filed from React error boundary.',
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <ClientIncidentFallback
          source="client"
          severity="high"
          message={this.state.message || 'React render failure'}
          stack={this.state.stack}
          context={{ componentStack: this.state.componentStack }}
          autoFiled
        />
      );
    }

    return this.props.children;
  }
}
