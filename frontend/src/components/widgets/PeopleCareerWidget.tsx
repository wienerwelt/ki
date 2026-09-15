import React,{useEffect,useState} from 'react';
import {Avatar,Box,Button,List,ListItemButton,ListItemAvatar,ListItemText,Typography} from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../../context/AuthContext';
import {resolveAssetUrl} from '../../utils/assetUrl';
import {CareerEntry,careerKinds,careerRequest} from '../CareerPanel';
import WidgetPaper from './WidgetPaper';
export default function PeopleCareerWidget(props:any){const{user}=useAuth();const navigate=useNavigate();const[entries,setEntries]=useState<CareerEntry[]>([]);const[error,setError]=useState('');
 useEffect(()=>{let live=true;if(props.isPublic)return;careerRequest('/api/career?limit=5').then(data=>{if(live)setEntries(data.entries);}).catch((e:any)=>{if(live)setError(e.message);});return()=>{live=false;};},[user?.business_partner_id,props.isPublic]);if(props.isPublic)return null;
 return <WidgetPaper {...props} widgetTitle="Menschen & Karriere" widgetTypeKey="PeopleCareer" title={<Box sx={{display:'flex',gap:1,alignItems:'center'}}><PeopleOutlineIcon/> Menschen & Karriere</Box>} error={error||null}><List disablePadding>{entries.map(e=><ListItemButton key={e.id} onClick={()=>navigate(`/career?entry=${e.id}`)}><ListItemAvatar><Avatar src={e.photo_url||(e.organization_logo?resolveAssetUrl(e.organization_logo):undefined)}><PeopleOutlineIcon/></Avatar></ListItemAvatar><ListItemText primary={e.person_name} secondary={`${e.organization} · ${e.role_title||careerKinds[e.kind]}`} primaryTypographyProps={{fontWeight:800}}/></ListItemButton>)}</List>{!entries.length&&<Typography color="text.secondary" sx={{p:1}}>Wer bewegt die Branche? Teilen Sie das erste Karriere-Update.</Typography>}<Button fullWidth onClick={()=>navigate('/career')} sx={{mt:1,textTransform:'none'}}>Personalien entdecken & Update teilen</Button></WidgetPaper>;
}
