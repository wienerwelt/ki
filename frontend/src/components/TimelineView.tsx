import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, LabelList } from 'recharts';
import { Paper, Typography } from '@mui/material';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { de } from 'date-fns/locale/de';

interface FundingResult {
  id: string;
  title: string;
  deadline_end: string | null;
  match_score: number;
}

interface TimelineViewProps {
  data: FundingResult[];
}

// =============================================================================
// NEU: Eine benutzerdefinierte Komponente für die Y-Achsen-Beschriftung
// =============================================================================
const CustomizedYAxisTick = (props: any) => {
  const { x, y, payload, data } = props;
  const navigate = useNavigate();

  // Finde das zugehörige Datenelement, um die ID für den Link zu erhalten
  const correspondingData = data.find((item: FundingResult) => item.title === payload.value);
  const targetId = correspondingData ? correspondingData.id : null;

  const handleTickClick = () => {
    if (targetId) {
      navigate(`/funding-detail/${targetId}`);
    }
  };
  
  // Titel kürzen, wenn er zu lang ist
  const MAX_LENGTH = 25;
  const truncatedTitle = payload.value.length > MAX_LENGTH 
    ? `${payload.value.substring(0, MAX_LENGTH)}…` 
    : payload.value;

  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: 'pointer' }} onClick={handleTickClick}>
      <text x={0} y={0} dy={4} textAnchor="end" fill="#666" fontSize={12}>
        {/* Der SVG <title>-Tag erzeugt einen nativen Browser-Tooltip für den vollen Titel */}
        <title>{payload.value}</title>
        {truncatedTitle}
      </text>
    </g>
  );
};
// =============================================================================


const TimelineView: React.FC<TimelineViewProps> = ({ data }) => {
  const navigate = useNavigate();

  const chartData = data
    .filter(item => item.deadline_end && new Date(item.deadline_end) > new Date())
    .map(item => ({
      ...item,
      deadline_timestamp: new Date(item.deadline_end!).getTime(),
      days_remaining_label: formatDistanceToNowStrict(new Date(item.deadline_end!), { locale: de, unit: 'day' })
    }))
    .sort((a, b) => a.deadline_timestamp - b.deadline_timestamp);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <Paper sx={{ p: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{item.title}</Typography>
          <Typography variant="caption">
            Frist: {format(new Date(item.deadline_end!), 'dd.MM.yyyy', { locale: de })}
          </Typography>
          <br/>
          <Typography variant="caption">Relevanz: {Math.round(item.match_score)}%</Typography>
        </Paper>
      );
    }
    return null;
  };

  const handleBarClick = (data: any) => {
    navigate(`/funding-detail/${data.id}`);
  };

  return (
    <Paper sx={{ p: 3, height: '120vh', width: '100%' }}>
      <Typography variant="h6" gutterBottom>Förder-Timeline</Typography>
      <ResponsiveContainer width="100%" height="95%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 90, left: 100, bottom: 5 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            type="number" 
            domain={['dataMin', 'dataMax']}
            tickFormatter={(timestamp) => format(new Date(timestamp), 'MMM yy', { locale: de })}
            scale="time"
          />
          <YAxis 
            type="category" 
            dataKey="title" 
            width={150} 
            interval={0}
            // HIER WIRD DIE NEUE KOMPONENTE EINGESETZT
            tick={<CustomizedYAxisTick data={chartData} />}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(206, 206, 206, 0.2)' }} />
          <Bar dataKey="deadline_timestamp" onClick={handleBarClick} barSize={25} radius={[0, 10, 10, 0]}>
            <LabelList 
                dataKey="days_remaining_label" 
                position="right" 
                offset={10}
                style={{ fill: '#555', fontSize: '12px', fontWeight: 'bold' }} 
            />
            {chartData.map((entry) => {
              const score = entry.match_score;
              const color = score > 70 ? '#2e7d32' : score > 40 ? '#ed6c02' : '#1976d2';
              return <Cell key={`cell-${entry.id}`} fill={color} style={{ cursor: 'pointer' }} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default TimelineView;