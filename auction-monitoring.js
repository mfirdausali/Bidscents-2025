#!/usr/bin/env node

/**
 * Auction Timing Monitoring System
 * Provides real-time monitoring and alerting for auction timing issues
 */

class AuctionMonitor {
  constructor() {
    this.alerts = [];
    this.metrics = {
      totalAuctions: 0,
      activeAuctions: 0,
      expiredAuctions: 0,
      overdueAuctions: 0,
      invalidTimestamps: 0,
      averageProcessingDelay: 0
    };
  }

  /**
   * Simulate auction data retrieval (replace with actual database calls)
   */
  async getAuctionData() {
    // This would normally come from your database
    // For testing, we'll simulate some auction data
    const now = Date.now();
    
    return [
      {
        id: 1,
        endsAt: new Date(now + 1800000).toISOString().replace('T', ' ').replace('Z', '+00'), // 30 min future
        status: 'active',
        productName: 'Test Product 1'
      },
      {
        id: 2,
        endsAt: new Date(now - 600000).toISOString().replace('T', ' ').replace('Z', '+00'), // 10 min past
        status: 'active', // This should be flagged as overdue
        productName: 'Test Product 2'
      },
      {
        id: 3,
        endsAt: new Date(now + 3600000).toISOString().replace('T', ' ').replace('Z', '+00'), // 1 hour future
        status: 'active',
        productName: 'Test Product 3'
      },
      {
        id: 4,
        endsAt: 'invalid-timestamp', // This should be flagged as invalid
        status: 'active',
        productName: 'Test Product 4'
      }
    ];
  }

  /**
   * Analyze auction timing and detect issues
   */
  analyzeAuctionTiming(auctions) {
    const now = Date.now();
    const issues = [];
    
    auctions.forEach(auction => {
      try {
        // Test timestamp parsing
        const endDate = new Date(auction.endsAt);
        
        if (isNaN(endDate.getTime())) {
          issues.push({
            type: 'INVALID_TIMESTAMP',
            severity: 'HIGH',
            auctionId: auction.id,
            message: `Invalid timestamp format: "${auction.endsAt}"`,
            productName: auction.productName
          });
          this.metrics.invalidTimestamps++;
          return;
        }

        const timeUntilEnd = endDate.getTime() - now;
        const hoursUntilEnd = timeUntilEnd / (1000 * 60 * 60);
        const isExpired = timeUntilEnd < 0;

        // Check for overdue auctions (expired but still marked as active)
        if (isExpired && auction.status === 'active') {
          const overdueHours = Math.abs(hoursUntilEnd);
          const severity = overdueHours > 1 ? 'CRITICAL' : 'HIGH';
          
          issues.push({
            type: 'OVERDUE_AUCTION',
            severity: severity,
            auctionId: auction.id,
            message: `Auction overdue by ${overdueHours.toFixed(2)} hours`,
            productName: auction.productName,
            overdueHours: overdueHours
          });
          this.metrics.overdueAuctions++;
        }

        // Check for auctions expiring soon (within 5 minutes)
        if (!isExpired && timeUntilEnd < 300000 && auction.status === 'active') {
          issues.push({
            type: 'EXPIRING_SOON',
            severity: 'MEDIUM',
            auctionId: auction.id,
            message: `Auction expires in ${Math.round(timeUntilEnd / 60000)} minutes`,
            productName: auction.productName,
            minutesUntilEnd: Math.round(timeUntilEnd / 60000)
          });
        }

        // Update metrics
        if (auction.status === 'active') {
          this.metrics.activeAuctions++;
        }
        if (isExpired) {
          this.metrics.expiredAuctions++;
        }

      } catch (error) {
        issues.push({
          type: 'PARSING_ERROR',
          severity: 'HIGH',
          auctionId: auction.id,
          message: `Error parsing auction data: ${error.message}`,
          productName: auction.productName
        });
      }
    });

    this.metrics.totalAuctions = auctions.length;
    return issues;
  }

  /**
   * Generate alerts based on detected issues
   */
  generateAlerts(issues) {
    const alerts = [];
    
    // Group issues by severity
    const critical = issues.filter(i => i.severity === 'CRITICAL');
    const high = issues.filter(i => i.severity === 'HIGH');
    const medium = issues.filter(i => i.severity === 'MEDIUM');

    if (critical.length > 0) {
      alerts.push({
        level: 'CRITICAL',
        message: `🚨 ${critical.length} CRITICAL auction timing issues detected!`,
        details: critical,
        action: 'Immediate attention required - auctions may be significantly overdue'
      });
    }

    if (high.length > 0) {
      alerts.push({
        level: 'HIGH',
        message: `⚠️  ${high.length} HIGH priority auction issues detected`,
        details: high,
        action: 'Review and resolve within 15 minutes'
      });
    }

    if (medium.length > 0) {
      alerts.push({
        level: 'MEDIUM',
        message: `📋 ${medium.length} auction(s) expiring soon`,
        details: medium,
        action: 'Monitor for proper expiry processing'
      });
    }

    return alerts;
  }

  /**
   * Print monitoring dashboard
   */
  printDashboard() {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 AUCTION TIMING MONITORING DASHBOARD');
    console.log('='.repeat(60));
    console.log(`📊 Timestamp: ${new Date().toISOString()}`);
    console.log(`🌍 Server TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone} (UTC${new Date().getTimezoneOffset() <= 0 ? '+' : ''}${-new Date().getTimezoneOffset() / 60})`);
    console.log('');
    
    console.log('📈 METRICS:');
    console.log(`   Total Auctions:    ${this.metrics.totalAuctions}`);
    console.log(`   Active Auctions:   ${this.metrics.activeAuctions}`);
    console.log(`   Expired Auctions:  ${this.metrics.expiredAuctions}`);
    console.log(`   Overdue Auctions:  ${this.metrics.overdueAuctions} ${this.metrics.overdueAuctions > 0 ? '⚠️' : '✅'}`);
    console.log(`   Invalid Timestamps: ${this.metrics.invalidTimestamps} ${this.metrics.invalidTimestamps > 0 ? '❌' : '✅'}`);
    console.log('');

    // Health status
    const isHealthy = this.metrics.overdueAuctions === 0 && this.metrics.invalidTimestamps === 0;
    console.log(`🏥 SYSTEM HEALTH: ${isHealthy ? '✅ HEALTHY' : '❌ ISSUES DETECTED'}`);
    
    if (!isHealthy) {
      console.log('   🔧 ACTION REQUIRED: Auction timing issues need attention');
    }
  }

  /**
   * Print alerts
   */
  printAlerts(alerts) {
    if (alerts.length === 0) {
      console.log('\n🎉 NO ALERTS - All auction timing looks good!');
      return;
    }

    console.log('\n🚨 ALERTS:');
    console.log('-'.repeat(50));
    
    alerts.forEach((alert, index) => {
      console.log(`\n${index + 1}. ${alert.message}`);
      console.log(`   Action: ${alert.action}`);
      
      if (alert.details.length <= 3) {
        alert.details.forEach(detail => {
          console.log(`   - Auction #${detail.auctionId} (${detail.productName}): ${detail.message}`);
        });
      } else {
        console.log(`   - ${alert.details.length} affected auctions (showing first 3):`);
        alert.details.slice(0, 3).forEach(detail => {
          console.log(`     • Auction #${detail.auctionId}: ${detail.message}`);
        });
        console.log(`     • ... and ${alert.details.length - 3} more`);
      }
    });
  }

  /**
   * Run monitoring check
   */
  async runMonitoringCheck() {
    console.log('🔍 Running auction timing monitoring check...');
    
    try {
      // Get auction data
      const auctions = await this.getAuctionData();
      
      // Analyze timing
      const issues = this.analyzeAuctionTiming(auctions);
      
      // Generate alerts
      const alerts = this.generateAlerts(issues);
      
      // Display results
      this.printDashboard();
      this.printAlerts(alerts);
      
      // Return status for automated systems
      return {
        healthy: issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length === 0,
        metrics: this.metrics,
        issues: issues,
        alerts: alerts
      };
      
    } catch (error) {
      console.error('❌ Monitoring check failed:', error);
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Start continuous monitoring (for production use)
   */
  startContinuousMonitoring(intervalMinutes = 5) {
    console.log(`🔄 Starting continuous monitoring (every ${intervalMinutes} minutes)`);
    
    // Run initial check
    this.runMonitoringCheck();
    
    // Set up interval
    setInterval(async () => {
      console.log('\n' + '='.repeat(30));
      console.log('🔄 Scheduled monitoring check');
      console.log('='.repeat(30));
      
      const result = await this.runMonitoringCheck();
      
      // In production, you might want to:
      // - Send alerts to Slack/Discord
      // - Log to monitoring service
      // - Send email notifications
      // - Update metrics dashboard
      
    }, intervalMinutes * 60 * 1000);
  }
}

// CLI interface
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const monitor = new AuctionMonitor();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--continuous')) {
    const interval = parseInt(args[args.indexOf('--interval') + 1]) || 5;
    monitor.startContinuousMonitoring(interval);
  } else {
    monitor.runMonitoringCheck().then(result => {
      process.exit(result.healthy ? 0 : 1);
    });
  }
}

export default AuctionMonitor;