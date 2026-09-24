import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BrandLogo from './BrandLogo';
import { 
  LayoutDashboard, 
  UserPlus, 
  Users, 
  Clock, 
  FileText, 
  Printer,
  LogOut, 
  Monitor,
  Shield,
  BarChart3,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (val: boolean) => void;
  isHidden: boolean;
}

export default function Sidebar({
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  isHidden
}: SidebarProps) {
  const { profile, logout } = useAuth();
  const [isHovered, setIsHovered] = useState(false);

  const isExpanded = isMobileOpen || !isCollapsed || isHovered;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/intake', icon: UserPlus, label: 'Patient Intake', roles: ['receptionist', 'facilityadmin', 'superadmin'] },
    { to: '/patients', icon: Users, label: 'Patient List' },
    { to: '/pending', icon: Clock, label: 'Pending Studies', roles: ['radiographer', 'sonographer', 'facilityadmin', 'superadmin'] },
    { to: '/reporting', icon: FileText, label: 'Reporting', roles: ['radiologist', 'facilityadmin', 'superadmin'] },
    { to: '/finalized', icon: Printer, label: 'Finalized Reports', roles: ['receptionist', 'radiologist', 'sonographer', 'facilityadmin', 'superadmin'] },
    { to: '/analytics', icon: BarChart3, label: 'Analytics', roles: ['superadmin', 'facilityadmin'] },
    { to: '/admin', icon: Shield, label: 'Admin Portal', roles: ['superadmin', 'facilityadmin'] },
    { to: '/settings', icon: SettingsIcon, label: 'Settings' },
    { to: '/viewer', icon: Monitor, label: 'DICOM Viewer', roles: ['radiologist', 'radiographer', 'facilityadmin', 'superadmin'] },
  ];

  const filteredItems = navItems.filter(item => !item.roles || (profile && item.roles.includes(profile.role)));

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[50] md:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside 
        initial={false}
        animate={{ 
          width: isHidden ? 0 : (isMobileOpen ? 256 : (isExpanded ? 256 : 80)),
          opacity: isHidden ? 0 : 1
        }}
        transition={{ duration: 0.15, ease: 'circOut' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "glass-panel flex flex-col shrink-0 z-[55] transition-all duration-150 ease-out",
          "fixed inset-y-0 left-0 md:relative md:translate-x-0",
          isHidden ? "md:m-0 md:p-0 md:border-0 md:-translate-x-[280px] overflow-hidden shadow-none" : "md:m-4 md:mr-0 md:translate-x-0",
          !isMobileOpen ? "-translate-x-full" : "translate-x-0"
        )}
      >
        {!isHidden && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            title={isCollapsed ? "Pin sidebar open" : "Collapse sidebar"}
            className="hidden md:flex absolute -right-3 top-10 w-6 h-6 rounded-full bg-primary items-center justify-center text-black shadow-lg hover:scale-110 transition-transform active:scale-95 z-50 cursor-pointer"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}

        <div className="p-6 border-b border-white/10 overflow-hidden shrink-0 flex items-center justify-between">
          <NavLink to="/" className="hover:opacity-80 transition-opacity">
            <BrandLogo 
              type={!isExpanded ? 'icon' : 'full'} 
              className={cn(!isExpanded ? "mx-auto" : "")} 
            />
          </NavLink>
          {isMobileOpen && (
            <button
              onClick={() => setIsMobileOpen(false)}
              className="md:hidden p-2 rounded-xl text-muted hover:text-primary active:scale-95 transition-all outline-none flex items-center justify-center border border-white/10 bg-white/5 cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {filteredItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsMobileOpen(false)}
              title={!isExpanded ? item.label : undefined}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 hover:bg-white/5",
                isActive ? "bg-primary/20 text-primary" : "text-muted",
                !isExpanded ? "justify-center px-0" : ""
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {isExpanded && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.1 }}
                  className="whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 shrink-0">
          <div className={cn(
            "flex items-center gap-3 py-3 mb-4 transition-all duration-200",
            !isExpanded ? "justify-center" : "px-4"
          )}>
            <div className="w-10 h-10 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {profile?.displayName?.[0] || profile?.email?.[0]}
            </div>
            {isExpanded && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.1 }}
                className="flex-1 min-w-0"
              >
                <p className="text-sm font-bold truncate">{profile?.displayName}</p>
                <p className="text-xs text-muted capitalize truncate">{profile?.role}</p>
              </motion.div>
            )}
          </div>
          <button 
            onClick={logout}
            title={!isExpanded ? "Logout" : undefined}
            className={cn(
              "flex items-center gap-3 py-3 w-full rounded-xl text-danger hover:bg-danger/10 transition-all cursor-pointer",
              !isExpanded ? "justify-center" : "px-4"
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isExpanded && <span className="whitespace-nowrap">Logout</span>}
          </button>
        </div>
      </motion.aside>
    </>
  );
}
