const TopBar = ({ title, children }) => {
  return (
    <div className="h-16 border-b border-gray-800 bg-[#0a0a0b] px-6 flex items-center justify-between">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-4">
        {children}
      </div>
    </div>
  );
};

export default TopBar;
