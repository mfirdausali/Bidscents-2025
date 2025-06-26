import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/queryClient';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Users, 
  Lock, 
  TrendingUp,
  Clock,
  MapPin,
  FileText,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Progress } from '../../components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../../components/ui/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import { ScrollArea } from '../../components/ui/scroll-area';
import { useToast } from '../../hooks/use-toast';

// Types
interface AuthMetrics {
  stats: {
    totalAttempts: number;
    successfulLogins: number;
    failedLogins: number;
    uniqueUsers: number;
    avgAttemptsPerUser: number;
  };
  failedPatterns: Array<{
    userId: string;
    email: string;
    failureCount: number;
    lastAttempt: string;
  }>;
  lockouts: {
    count: number;
    users: string[];
  };
}

interface SecurityAlert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  status: 'new' | 'acknowledged' | 'resolved';
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

interface RateLimitStats {
  violationsByEndpoint: Array<{
    endpoint: string;
    method: string;
    count: number;
    uniqueIps: number;
  }>;
  violationsByIp: Array<{
    ipAddress: string;
    count: number;
    endpoints: string[];
    lastViolation: string;
  }>;
  heatMapData: Array<{
    hour: number;
    dayOfWeek: number;
    count: number;
  }>;
}

export function SecurityDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Calculate date range
  const getDateRange = () => {
    const end = new Date();
    let start;
    switch (timeRange) {
      case '1h':
        start = subDays(end, 1/24);
        break;
      case '24h':
        start = subDays(end, 1);
        break;
      case '7d':
        start = subDays(end, 7);
        break;
      case '30d':
        start = subDays(end, 30);
        break;
      default:
        start = subDays(end, 1);
    }
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  };

  // Queries
  const { data: authMetrics, isLoading: authLoading } = useQuery<AuthMetrics>({
    queryKey: ['authMetrics', timeRange],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const response = await apiRequest(`/api/security/auth-metrics?startDate=${startDate}&endDate=${endDate}`);
      return response;
    },
    refetchInterval: autoRefresh ? 30000 : false
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery<{
    alerts: SecurityAlert[];
    stats: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      unacknowledged: number;
    };
  }>({
    queryKey: ['securityAlerts', timeRange],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const response = await api.get('/api/security/alerts', {
        params: { startDate, endDate, limit: 50 }
      });
      return response.data;
    },
    refetchInterval: autoRefresh ? 10000 : false
  });

  const { data: rateLimitStats } = useQuery<RateLimitStats>({
    queryKey: ['rateLimitStats', timeRange],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const response = await api.get('/api/security/rate-limits', {
        params: { startDate, endDate }
      });
      return response.data;
    },
    refetchInterval: autoRefresh ? 60000 : false
  });

  const { data: activeSessions } = useQuery({
    queryKey: ['activeSessions'],
    queryFn: async () => {
      const response = await api.get('/api/security/sessions');
      return response.data;
    },
    refetchInterval: autoRefresh ? 60000 : false
  });

  const { data: suspiciousActivity } = useQuery({
    queryKey: ['suspiciousActivity'],
    queryFn: async () => {
      const response = await api.get('/api/security/suspicious-activity');
      return response.data;
    },
    refetchInterval: autoRefresh ? 30000 : false
  });

  // Mutations
  const acknowledgeMutation = useMutation({
    mutationFn: async ({ alertId, notes }: { alertId: string; notes: string }) => {
      const response = await api.post(`/api/security/alerts/${alertId}/acknowledge`, {
        acknowledgedBy: 'admin', // Should come from auth context
        notes
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['securityAlerts'] });
      toast({
        title: "Success",
        description: "Alert acknowledged",
      });
    }
  });

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['authMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['securityAlerts'] });
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, queryClient]);

  // Components
  const MetricCard = ({ 
    title, 
    value, 
    icon: Icon, 
    trend, 
    description 
  }: {
    title: string;
    value: string | number;
    icon: React.ElementType;
    trend?: { value: number; isPositive: boolean };
    description?: string;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <div className={`flex items-center text-xs ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className="h-3 w-3 mr-1" />
            {trend.value}% from last period
          </div>
        )}
      </CardContent>
    </Card>
  );

  const AlertItem = ({ alert }: { alert: SecurityAlert }) => (
    <div className="flex items-start space-x-3 p-3 border rounded-lg">
      <div className="mt-1">
        {alert.severity === 'critical' && <AlertCircle className="h-5 w-5 text-red-600" />}
        {alert.severity === 'high' && <AlertTriangle className="h-5 w-5 text-orange-600" />}
        {alert.severity === 'medium' && <AlertCircle className="h-5 w-5 text-yellow-600" />}
        {alert.severity === 'low' && <AlertCircle className="h-5 w-5 text-blue-600" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{alert.title}</h4>
          <Badge variant={alert.status === 'new' ? 'destructive' : 'secondary'}>
            {alert.status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {format(new Date(alert.createdAt), 'MMM d, HH:mm')}
          </span>
          {alert.status === 'new' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => acknowledgeMutation.mutate({ 
                alertId: alert.id, 
                notes: 'Acknowledged via dashboard' 
              })}
            >
              Acknowledge
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const RateLimitHeatMap = ({ data }: { data: RateLimitStats['heatMapData'] }) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({ length: 24 }, (_, i) => i);
    
    const getIntensity = (hour: number, day: number) => {
      const item = data.find(d => d.hour === hour && d.dayOfWeek === day);
      if (!item) return 0;
      const max = Math.max(...data.map(d => d.count));
      return item.count / max;
    };

    return (
      <div className="space-y-2">
        <div className="flex space-x-2">
          <div className="w-12"></div>
          {hours.map(hour => (
            <div key={hour} className="w-6 text-xs text-center text-muted-foreground">
              {hour}
            </div>
          ))}
        </div>
        {days.map((day, dayIndex) => (
          <div key={day} className="flex space-x-2">
            <div className="w-12 text-xs text-muted-foreground">{day}</div>
            {hours.map(hour => {
              const intensity = getIntensity(hour, dayIndex);
              return (
                <div
                  key={`${day}-${hour}`}
                  className="w-6 h-6 rounded"
                  style={{
                    backgroundColor: `rgba(239, 68, 68, ${intensity})`,
                    opacity: intensity > 0 ? 1 : 0.1
                  }}
                  title={`${day} ${hour}:00 - ${data.find(d => d.hour === hour && d.dayOfWeek === dayIndex)?.count || 0} violations`}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Dashboard</h1>
          <p className="text-muted-foreground">Monitor security events and system health</p>
        </div>
        <div className="flex items-center space-x-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'text-green-600' : ''}
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Login Attempts"
          value={authMetrics?.stats.totalAttempts || 0}
          icon={Activity}
          description={`${authMetrics?.stats.successfulLogins || 0} successful`}
        />
        <MetricCard
          title="Failed Logins"
          value={authMetrics?.stats.failedLogins || 0}
          icon={XCircle}
          description={`${authMetrics?.failedPatterns.length || 0} users with multiple failures`}
        />
        <MetricCard
          title="Active Sessions"
          value={activeSessions?.totalSessions || 0}
          icon={Users}
          description={`${activeSessions?.uniqueUsers || 0} unique users`}
        />
        <MetricCard
          title="Security Alerts"
          value={alerts?.stats.unacknowledged || 0}
          icon={AlertTriangle}
          description={`${alerts?.stats.critical || 0} critical`}
        />
      </div>

      {/* Alert Summary */}
      {alerts?.stats.unacknowledged > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unacknowledged Alerts</AlertTitle>
          <AlertDescription>
            You have {alerts.stats.unacknowledged} unacknowledged security alerts requiring attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Suspicious Activity */}
      {suspiciousActivity && (
        <Card>
          <CardHeader>
            <CardTitle>Suspicious Activity Detected</CardTitle>
            <CardDescription>Unusual patterns requiring investigation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {suspiciousActivity.rapidFailedLogins?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Rapid Failed Login Attempts</h4>
                  <div className="space-y-2">
                    {suspiciousActivity.rapidFailedLogins.map((item: any) => (
                      <div key={item.userId} className="flex items-center justify-between p-2 bg-red-50 rounded">
                        <span className="text-sm">{item.email}</span>
                        <Badge variant="destructive">{item.attempts} attempts</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {suspiciousActivity.multipleIpUsers?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Multiple IP Addresses</h4>
                  <div className="space-y-2">
                    {suspiciousActivity.multipleIpUsers.map((item: any) => (
                      <div key={item.userId} className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                        <span className="text-sm">{item.email}</span>
                        <Badge variant="outline">{item.ipCount} IPs</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">Security Alerts</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="rate-limits">Rate Limits</TabsTrigger>
          <TabsTrigger value="sessions">Active Sessions</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Security Alerts</CardTitle>
              <CardDescription>Monitor and respond to security events</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {alerts?.alerts.map(alert => (
                    <AlertItem key={alert.id} alert={alert} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="authentication" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Login Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Success Rate</span>
                    <span className="text-2xl font-bold">
                      {authMetrics ? 
                        Math.round((authMetrics.stats.successfulLogins / authMetrics.stats.totalAttempts) * 100) : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={authMetrics ? 
                      (authMetrics.stats.successfulLogins / authMetrics.stats.totalAttempts) * 100 : 0} 
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account Lockouts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-2xl font-bold">{authMetrics?.lockouts.count || 0}</div>
                  <p className="text-sm text-muted-foreground">
                    Accounts currently locked
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Failed Login Patterns</CardTitle>
              <CardDescription>Users with multiple failed login attempts</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Failed Attempts</TableHead>
                    <TableHead>Last Attempt</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authMetrics?.failedPatterns.map(pattern => (
                    <TableRow key={pattern.userId}>
                      <TableCell>{pattern.email}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{pattern.failureCount}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(pattern.lastAttempt), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline">
                          <Lock className="h-3 w-3 mr-1" />
                          Lock Account
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rate-limits" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Rate Limit Violations by Endpoint</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Violations</TableHead>
                      <TableHead>Unique IPs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateLimitStats?.violationsByEndpoint.slice(0, 10).map((violation, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-xs">{violation.endpoint}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{violation.method}</Badge>
                        </TableCell>
                        <TableCell>{violation.count}</TableCell>
                        <TableCell>{violation.uniqueIps}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Violating IPs</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Violations</TableHead>
                      <TableHead>Last Violation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateLimitStats?.violationsByIp.slice(0, 10).map((violation, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono">{violation.ipAddress}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{violation.count}</Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(violation.lastViolation), 'MMM d, HH:mm')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Rate Limit Heat Map</CardTitle>
              <CardDescription>Violations by hour and day of week</CardDescription>
            </CardHeader>
            <CardContent>
              {rateLimitStats?.heatMapData && (
                <RateLimitHeatMap data={rateLimitStats.heatMapData} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                {activeSessions?.totalSessions || 0} active sessions from {activeSessions?.uniqueUsers || 0} users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>User Agent</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSessions?.sessions.slice(0, 20).map((session: any) => (
                    <TableRow key={session.id}>
                      <TableCell>{session.userEmail}</TableCell>
                      <TableCell className="font-mono">{session.ipAddress}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {session.userAgent}
                      </TableCell>
                      <TableCell>
                        {format(new Date(session.lastActivity), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell>
                        {Math.round((new Date().getTime() - new Date(session.createdAt).getTime()) / 60000)} min
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline">
                          Terminate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audit Logs</CardTitle>
              <CardDescription>Track all system activities and changes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                Audit log viewer coming soon...
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Reports</CardTitle>
              <CardDescription>Generate and download security reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Daily Summary Report</h4>
                  <p className="text-xs text-muted-foreground">
                    Overview of security events for the past 24 hours
                  </p>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Generate Report
                  </Button>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Compliance Report</h4>
                  <p className="text-xs text-muted-foreground">
                    Security compliance status and audit trail
                  </p>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Generate Report
                  </Button>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">User Access Report</h4>
                  <p className="text-xs text-muted-foreground">
                    User permissions and access patterns
                  </p>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Generate Report
                  </Button>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Incident Report</h4>
                  <p className="text-xs text-muted-foreground">
                    Security incidents and response actions
                  </p>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Generate Report
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}