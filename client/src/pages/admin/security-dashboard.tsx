import React from 'react';
import { Shield } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

export function SecurityDashboard() {
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Security Dashboard</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Security Monitoring</CardTitle>
          <CardDescription>
            Security dashboard is being configured. Check back soon for real-time security metrics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">
            <p>Features coming soon:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Authentication metrics and failed login tracking</li>
              <li>Rate limiting statistics</li>
              <li>Security alerts and notifications</li>
              <li>Active session monitoring</li>
              <li>Audit log viewer</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}