'use client';
import { useEffect, useRef } from 'react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function TrendChart({ labels, onTime, late }: { labels: string[]; onTime: number[]; late: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'On time %', data: onTime, backgroundColor: '#1e7f4f', stack: 's' },
        { label: 'Late %', data: late, backgroundColor: '#e0a21f', stack: 's' } ] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { stacked: true, max: 100, ticks: { callback: (v) => `${v}%` } }, x: { stacked: true } }, plugins: { legend: { position: 'bottom' } } },
    });
    return () => chart.destroy();
  }, [labels, onTime, late]);
  return <div style={{ height: 260 }}><canvas ref={ref} role="img" aria-label="Weekly submission percentages, on time and late" /></div>;
}
