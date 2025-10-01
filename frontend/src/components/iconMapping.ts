// frontend/src/components/iconMapping.ts
import React from 'react';

// Importiere hier ALLE Icons, die du in Widgets verwendest
import SpaIcon from '@mui/icons-material/Spa';
import BusinessIcon from '@mui/icons-material/Business';
import TrafficIcon from '@mui/icons-material/Traffic';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import GavelIcon from '@mui/icons-material/Gavel';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import EvStationIcon from '@mui/icons-material/EvStation';
import CommuteIcon from '@mui/icons-material/Commute';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import StarsIcon from '@mui/icons-material/Stars';
import FactoryIcon from '@mui/icons-material/Factory';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import FolderIcon from '@mui/icons-material/Folder';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PodcastsIcon from '@mui/icons-material/Podcasts';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import PollIcon from '@mui/icons-material/Poll';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import BarChartIcon from '@mui/icons-material/BarChart';

export const ICON_MAP: { [key: string]: React.ElementType<any> } = {
    SpaIcon: SpaIcon,
    BusinessIcon: BusinessIcon,
    TrafficIcon: TrafficIcon,
    LocalGasStationIcon: LocalGasStationIcon,
    GavelIcon: GavelIcon,
    NewspaperIcon: NewspaperIcon,
    ConfirmationNumberIcon: ConfirmationNumberIcon,
    EvStationIcon: EvStationIcon,
    CommuteIcon: CommuteIcon,
    StarsIcon: StarsIcon,
    FactoryIcon: FactoryIcon,
    FactCheckIcon: FactCheckIcon,
    TrendingUpIcon: TrendingUpIcon,
    FolderIcon: FolderIcon,
    CalendarMonthIcon: CalendarMonthIcon,
    AccountBalanceIcon: AccountBalanceIcon,
    PodcastsIcon: PodcastsIcon,
    VideoLibraryIcon: VideoLibraryIcon,
    PollIcon: PollIcon,
    CompareArrowsIcon: CompareArrowsIcon,
    ShoppingCartCheckoutIcon: ShoppingCartCheckoutIcon,
    BarChartIcon: BarChartIcon,
};

// === GEÄNDERT: Die Funktion ist jetzt ein einfacher, direkter Lookup ===
export const getIcon = (iconName: string | null | undefined): React.ElementType<any> => {
    if (!iconName || !ICON_MAP[iconName]) {
        return HelpOutlineIcon;
    }
    return ICON_MAP[iconName];
};