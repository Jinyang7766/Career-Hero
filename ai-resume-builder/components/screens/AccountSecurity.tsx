import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';
import { supabase } from '../../src/supabase-client';

const AccountSecurity: React.FC<ScreenProps> = ({ goBack, currentUser, onLogout, setCurrentView }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { userProfile } = useUserProfile();
  const phone =
    currentUser?.user_metadata?.phone ||
    currentUser?.phone ||
    '';
  const email =
    userProfile?.email ||
    currentUser?.email ||
    '';

  const handleDeleteAccount = async (immediate: boolean = false) => {
    try {
      setIsDeleting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const endpoint = immediate
        ? '/api/user/delete-account-immediate'
        : '/api/user/request-deletion';

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      if (response.ok) {
        if (immediate) {
          alert('账号已立即永久注销');
          onLogout?.();
        } else {
          alert('注销申请已提交，账号进入3天冷静期');
          // Update currentUser locally to reflect pending deletion
          if (currentUser) {
            currentUser.deletion_pending_until = result.deletion_pending_until;
          }
          setCurrentView(View.DELETION_PENDING);
        }
      } else {
        alert(result.error || '操作失败');
      }
    } catch (err) {
      console.error(err);
      alert('网络错误');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark h-screen flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
      <div className="flex-none pt-safe-top bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl sticky top-0 z-50 border-b border-[#e5e5ea] dark:border-[#38383a] transition-colors duration-300">
        <div className="flex items-center justify-between px-4 py-3 h-[52px]">
          <button
            onClick={goBack}
            className="flex items-center justify-center size-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all text-primary"
          >
            <span className="material-symbols-outlined text-[26px]">arrow_back_ios_new</span>
          </button>
          <h1 className="text-[17px] font-semibold leading-tight absolute left-1/2 -translate-x-1/2">账号与安全</h1>
          <div className="size-10"></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">

        {/* Login Security */}
        <div className="mt-6 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">登录与安全</h3>
          <div className="bg-white dark:bg-[#1c1c1e] rounded-lg overflow-hidden shadow-sm border border-black/5 dark:border-white/5 flex flex-col divide-y divide-[#e5e5ea] dark:divide-[#38383a]">

            <button className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white">修改密码</span>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white">手机号</span>
              <span className="text-[15px] text-slate-500 dark:text-slate-400 mr-1">{phone || '未绑定'}</span>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white">电子邮箱</span>
              <span className="text-[15px] text-slate-500 dark:text-slate-400 mr-1">{email || '未绑定'}</span>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>
          </div>
        </div>

        {/* Third Party Accounts */}
        <div className="mt-8 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">第三方账号绑定</h3>
          <div className="bg-white dark:bg-[#1c1c1e] rounded-lg overflow-hidden shadow-sm border border-black/5 dark:border-white/5 flex flex-col divide-y divide-[#e5e5ea] dark:divide-[#38383a]">


            <div className="w-full flex items-center justify-between px-4 py-3.5 bg-white dark:bg-[#1c1c1e]">
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-slate-900 dark:text-white" viewBox="0 0 24 24" fill="currentColor" aria-label="WeChat">
                  <path d="M9.5 4C5.91 4 3 6.47 3 9.5c0 1.75 1 3.34 2.65 4.43l-.6 1.97 2.28-1.2c.7.2 1.44.31 2.17.31.24 0 .48-.01.71-.03-.06-.25-.09-.52-.09-.79 0-2.63 2.48-4.75 5.55-4.75.42 0 .83.04 1.23.11C15.78 6.35 12.92 4 9.5 4zm-2 4.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                  <path d="M16.55 10.5c-3.01 0-5.45 2.03-5.45 4.5s2.44 4.5 5.45 4.5c.59 0 1.17-.08 1.72-.22l2.08 1.1-.55-1.82c1.26-.82 2.03-2.06 2.03-3.56 0-2.47-2.44-4.5-5.28-4.5zm-1.95 2.7a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm3.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z" />
                </svg>
                <span className="text-[16px] font-medium text-slate-900 dark:text-white">微信</span>
              </div>
              <button className="text-[14px] font-medium text-primary hover:opacity-80">
                去绑定
              </button>
            </div>
            <div className="w-full flex items-center justify-between px-4 py-3.5 bg-white dark:bg-[#1c1c1e]">
              <div className="flex items-center gap-3">
                <img alt="QQ" className="h-6 w-6" style={{ filter: "grayscale(1) saturate(0) brightness(0) invert(1)" }} src="data:image/webp;base64,UklGRhQ2AABXRUJQVlA4WAoAAAAQAAAAFwIAfQIAQUxQSIEaAAAB8Mb/vyKn/f+dmd1NduPuhqR4cUpLcau7EIpbW6xvqONWwd2tOATnHRwSggVKSdAgwSFYnCS7WZlzLhCS3ZndM69XLkXEBBCVLvrG1mnW9t0vew/7ZeKMhWu2bE1K2peckpK8Lylp65Y1C2dM/GVY7y/ebdusToyvSBBc5xkQXr31N7/M2pz875WsB88KTRJzoGQqfPYg68q/yZtn/vLN29XDAjy1KCX4N/z45/k7ztwzM4Wa753ZPn/U12+ECnikj2z4wa9b0h/lFFspU7pUmvc4fcuvHzSN9UQeQQz/dMr2M4+szMnactJ3T/4kTBRwRozu/P26TBtz4vTejh86R4u4YghrOGLHlTwbc/q2vCs7RzUP02NJvf5rr1mYC7Vkrv2+oYAdmqiOE8/kmihztea8//7sHKlBC9HQZsG/pcxV05KzS971EjEi4pPVj5nLf7zq8xhcEINaTb1YxLiw+Mr8tkEiGtT+La2McWTZ6dGNMUCI+WxrjpVxpjVvz1dxAuxpqo87b2JcasoYW00Dd55d/ylhHGvc9KEPyAnhCak5lPFt/vFu4QK4BQ8/Z2McbD03LAjUNPFjssyUcTE135oQr4EyIWTMVco4ml6ZECaAWNyoh5RxNs0eUxO+IoddNzMOt9wcGi2AlnuP0zbG6dJ//Q1wZfj4SBll3E7NqZ/rYUqstayIcX7RqnoiQIWOfs5UYO7EMGjySEgzM1VoOdPNC5RqLDEx1Vi2Kh6O/Ic+kJiKlB6NDIAhsfE2E1OZZdsaiQDkMySXqdD8H3ygR2y4rZSqEWrc2UQEHbcetylTqfR+DzfAiV1jZCrWuC4WajRtTklM1Uon22hBxjAqj6newnEGgKm52sRUsGlNPLg0SZOYKpbONocVw8CnlKlk+myQAVA8pxQwFV3wlxeYxK5jKntjHIyIjU5Z1ZY1rZEIIe1uUKa66fUO8CEOfEqZCqc534vAYfiugKn0gsEG0PCYYWSq3TjTABjBi0xMxZuWhICF/zIbU/W2FQFAEXFIYipfOhwGEtW2U6b66dZqABF1mIHgkWhwqH7QBgO2wzWBIXoPA8M9kaAQdorCAT0dCgiRmxgk0o2RYOC/hYICo4kBQBC4zsKA0fJPAAi4/21j4Gj70x0AxGllDCDNM0TVpxtQwkCytL9O7XXPZUCZl6DuhI4PGVg+6CCoubhLFC7o5WoqLiaVgWZqrGozbLbAhmWjXqW5/W5jwGn71U2VCb0KKXTQwp6CGmt6iwHorWYqLOoCA9H0aNXls4zCCF3mrbZ+LmVAWvqTuhLaFTAwLWwvqKm4sxRO6NlYFeW5mYHqRg/VJA4pgZWSoaJaavyUAeuzhiop4ggD16ORqkj40wwv5j8ENdSxlAGssbMKij1FIYaejFU94gzKQJbOElWO8GUeA9q8zwV143+eQg09769q3KYywP3LTc10fQI5TzqrGM/TDHRPeKgW7a8W2LH8qlUr9e4y4L1TV6XoNzLw3aBXJ1/lw0/BV6rEO4MBcIaXCtH8RiGI/qJRH/WvMxC+Vk99rGRAvEp1tM+Hovy2KsNnB4UiutVbXXxlYWBs+UJVBKQyQE4JUBHCMBMkGQcL6iHwNgPlG/7q4QcGzENUQ+1MaLocrxbGWKHJ+rtKiHnAwPl+lCrQTrbCk3W8Vg3E3GYAfTNKDUyiEEXHqYAaVxhIX6rGf6OtMGX5jfv8HjCgvuvLe/0ZWPfmvMg0uDodznfdTHBl/IrrdMcZYB9z47l3iyCr6B2O06+kkEVX6PmtQSED7YL63Cb8yYB7ksBr1a5C15U4Xhtqhq6y7zlNSGPgfULgs1YMwFtymdsiCFug47HatyDsZi0eGyFBmDScw7SnGYif1PJX50IYK+jAXbrZEoxJM3W8FXabAfnNUN7qIUGZ1I2zdNsZmCdq+arpfTi724ivRljhzDKcr84wQD/NVfUtkGapw1OjKKTRXzkq5BgD9eQgfnqrANbyW/LTBAbsY7jJkAFt5/W81CoX2nJacpI41gZtttEiH/mkMHA/7M1Hr5XCW3FNPhrBAH44F7n9H+J2u/FQg9sQl1WPh74pgzhTAg+tZiC/nIPcn8DcIzf+aWmFOWtz/hknwZw0hnt8kyjM0T0+vFPrHgP6O6/xzhcS1Emf884CBvbzOEd/Ee4uuPNNk6dw96Qx3/Q1wZ2pD9e4LadwR5foeMY3gwH+fz48E2+BPHMNnunJQL87zyyCvfkcE3AK9k768Uvju7B3pyG/fGmGPdNn/PI3hT36B78cYcB/kFsMBdCXr+eV5mXQV9aYVwbboM82iFO0Syn00UUaPgk8zMD/gD+fxN+Dv9s1+aSVGf7K3uST7xkCDuKTFRiwlEuENAw4JfBI1B0MuB3BI62fY8Czt3iktwkDjD04RJxCMYBOEvnDfQtDwY3u/OF9EQfOe/NHUBEOFATyR2OGhK/zR08sSOCPKVgwkTuEbViwWeANv1QsSPbijRqXsSAjljdaPsaC+0144z0TFhR14o3BDAtpT96YjgZsPG9sw4O1vJGOB2mcIebgwRORL6JK8KAkgi9aGvHA2IIvPjHjgfljvhhixQPr93wxScIDaQJXaJZRPKBLNTzhtY0h4lZPnghKwYSjQTwRfRkTLkbxRPwjTHgYzxMNTZhgfJ0nOlJMoO154huGit14YgQuDOeJSbgwgScW4cICnkjEhU08cQQXDnGEkI4L5wV+8LqKC1c9+SEiCxeywvmh9n1cuFeLH5o/xoXHzfihYy4u5Hbghw8KcaHgfX74shgXij/nh54mXDD24IeBFlww9+eH4RIuSEP54ReKC/RnbhAmMmQcL/CCZjo2TBV5QbsQG+ZreUH3Dzas0vGC2xZs2OzGC+67sWGXOy/o92FDEj8cwIb9em44gg2HuMGQgg3JBm44jg2p3OBxGhtO8cNZbDjjwQ3nseEcN3hewIYMT264jA2X+CETGzL54So2XOGHS9hwkR8ysCHdgxc8/sOGc/xwFhvOcIPhNDacMnDDcWw4zg8p2JDMDfqj2HBYzw0HseEAP+zDhn3c4J6EDXvcuWEXNuzkh+3YsM2NF9w2YcMmbtCtw4a1Om5YiQ0ruEG7BBsWa7lhPjbM0/CCZiY2zOAG8W9s+EvkhskUF6RJ3KA/gA379bxQz8SQ0VSXE8SZDB1ninwQl4EPGXF80NeMD+Y+XKBJZgh5VMMDjYox4kVDDtDOlDBCmqVzfTGXGUpejnF9PShO0J4uT3+QIeUhvatr9RQrnrZycZrZFCvoHI1r87/P0PK+v2vryRCzh0vzScKMJB9X9tYzzHj+litbQDGDzndhAfcZat4LcF39ynDD3M9l+SVR3KBJfq6qcRFDzqImrmoBQ88FLir2Kn5cjXVNA0z4YRrgktxSKH7QFDdXVM/MENRczwVp5jIUnatxPTUu4cjFGq6nrwVHrH1djjaVIWmqztU0L8SSwuYuRjdHwhJpjs61RF9naHo9xrX0pHhCe7kUzyMMUY94upI2TzHlaRsXIsynmEIXCK7D7wlD1ad+rqMXQ9aeLsNvH7bs93cVrXKxJbeVq1jE0HWhiwi9iy/3wlzDgDJ8KRvoEnwPUnyhB31dQbMShrClzV3BQoayCwXnV+MqzmTWcH4Dy3CmbJDTE9MozrA0jbNraGFIa23o5LTzGNrO0zq3+Kt4czXeufWz4Y2tn1NzO8kQ96SbM3s7H3Py33ZiunkS5kjzdc4r+g5D3TvRzqs3xR3W22l5JzPkTfF2Vh2eY8/zDs5qEUPfxU7KLxd/cv2cUx+KP7SPUwo8hEGHA51R6wKGwAWtndEShsKLnVDMXRy6G+N8BppwyDTI6fgcozhEU3ycTdPHEhI9beps5jI0nutkql3Co4vVnMvXRjwydnMu+yke0QNOJaaYIXJJtDP5RcIk6WcnEnqMYhI9FuI82hQzVC5u4zyWM2Re7jQis7ApK8JZ9DVik7GPk/DYTbGJ7vJwDjVeMHQuqukcxjOEHu8UQk5h1MlgZ/BuIUYVvusMllGMosucgOdjhtKPPZTX3YpT1gTFeWygOEXXeyitzkOG1A9qK204xSppmMK0KQytU7TKap2DV8/fVpRmog2vbBM1SvK5wBD7go+SOkiYZWuvIGEhQ+0FgnLir+LW1ZrK6VGGW6ZvlLOLIfdOxUQVYVdRpFIGWrHLOkAhPrspdrHdPspo8JSh99MGyhjOEHyYItyPY9hxdyW0eIJhT1ooQBxjwzDbGFF+nmkMxdM85fe6BccsDWQn/MWQ/E9BbqGnsOxkiNy6FmFZYVe5zaVYRufIzP0OQ/Pb7vLqasIzU2dZaaZJeCZN08gp/F+G6GfD5NTahGmm1nL6k6H6FBn5ZuBahq982j/HteftZCNOlHBNmijKxXCOIfu/BrnUsWCbpbZcxjJ0HysTv0P4dshPHi2f4tvTlvL4WcI36Wd5pDCET5ZF9UKMK6wuh35mjDP3lYFhLcU4ulbvuJgshvI3YxzXxYZzts6OW8KQfpHDAtKx7ry/o9o/x7rn7Rwk/GbDOtuvgmN0Bxja79U5JtSId8YQx3zJEP8zh4jLMW+Z6IiY/zDvXLQj2hRiXkFrR4xmqP+7A4SjuHfIAeE5uPc81H5fGnHP+LndNDMk3JOmaewVdIoh/4lAe9Utwr7COvbqw9C/p73W4d8aOwVk4F+6v33aPsO/p63tM8SKf9YhdtFsYlUAN4j20GdXBXikt0d9WhWA1rXHMFYlcIgddOurBqzTVS7q36oBZyMr92Ze1YDclpUbQKsG0L6VW8+qCK6plO56VYFr2srUzasqkFurMj1NVQWM3SshTpWqCkh/iRXzPcCqDO7zqVj0w6oD96Mq9pZUdcD2RsVGsiqEP1RsfVWCNRXy/a8qwTmfijS+V5XgbsOKfFpcleDFxxUZR6sS0DEVELaxKoVbhFeJd6oWZImvCrZVLbAGvqo9q2LY9lW/VDX46RWaf6oarNaUF5Rc1eBoYHm1rivIhhk2BV17rbyWRcqxpmDGUatyCt8orwdVzoHPMOOz/cqhCeX9yRRb0v4NzGjRrkQxbHJ5exRjnaNrhBkNdbOtitlZjua6Ys5HkzqYUYtE/aeYTPGliCdKMX5NSHXMiCPka6NSHoe+1LpAIdJ8AyFhmBFKiGGBpJD8Vi/1MCrkQSwhxMeMFyZvQkjMfYWUJrw0RlJGyQBCCPF4ghfZHoQQMrBEGbZRhBC35VQZ671fMlzGi4uGl7w3KIMucSPEey9TIn1Wn7zsnooXx9xfIg2eUyWw/3sTEnxZEaWDxHJ02/AiUVeOMLBUEReDCYnOUwLd7UXK1S7DiyWacoj3LqqEnChCGlEl3GlMyhen4MVkoTzS5K4S6OuEfMoUaOknvoJ8a8UK67fklWI/iwLYR4QMUwA94E5e/ekLrCj65FXE/SBVwGBCZirgRgNSwZZPsOJxiwqQ+tcVMJ2QRPmZB4kVqX4LK27FVUT81iy/zUR3XHbSDk9SUc9LWHHRUBHiuZ3KLlUXki67rHqk4gexYj+peP0s2aUH17wuN/NQUslFWDG/EmSYWW7XajR7IDO62rsyA7CiX2V8/qEyu9+0Y67MHsaRyr5lwwlry8qQ2Acyy+nwWam8ivqQStd4hBMPq1eK9C2SV8knvSVZ0fnulQs+jhPHgirnPpfKytbrf0zO9GIcqbx+LcUIusa9ciTuEpUTG/6HrPK7EHuOtmGEbRSxZ5d8WU1eIifLX1q7fGzCCNOHdtFOtchp0RY5HQ4jdo0swoiiCLuQsMNy2rhfRs/qEDufx4hzxM61n8so6aR8SkcQey/GiAX2IiNK5JN6WT7LDXbrbsMHaze7GZbL58IdudCM6sTuLR7jQ3Zzu5Hq6VQuWY/lUvieYL/ws/hwJsx+wruFcnmYJxPTKJHYX1yFDysE+xFxlEkmuaXyoDuCiCN74cM3xJGB26g8ii3yuBVBHBpZig0lEQ4hkbflYbbJ4tlnxLGGVGxINjiGfPpUFhZJDnS81kHiJIoL0gTRQZqxVBZUBrZNfsTR7+TjQl4X4mi/LTYZWC2Oo9dqEoeH38CF66EOIzUzqePKSh2X3YnIcAMurCUy7JztuBcFDisboJXDVzZMsH0hB+2gMoflPnGUbZWOyLH6bUzIqi4Holttc9SjG45KCiay1K+keEBXuMuCBO91VOZ5x9AbjYlMu1vwwNyNyLTpTeqYf486JrcTkav/czx45icX0inHMYc2O6RosCgbshkPNhDZit8VOmTDAodM8SDy7WHGAnN3+RDDHw6ZN8oBlnXuRMZxF7AgI1ZGRL/e6oDf+tjsRo/FEDlr5mHBHFFOJCaF2s3W64MX9qIZdYi8m1lwwNKEyLvuBWqvovdaPLQTvdVMkJlXKg6keMpMaHqT2ulBs9irdnr0AZG7MNKCAeYRgswIefehnS5Hu6XYJ7cLkX/NexhwtwaRf5cc+xzVkUV2yf1OVIC4EQPWiwoQB+bYZT4hfexRNEQgSuxSCn/GLkSJwuBCe/QkpI6xcvkD3IkiAw9S6KMHAhVB3AYWVM5Ym5Cg85UqHCEQhQ6yQp91AFGoMKKgUucCCdFOkyrx+FOBKNXjLvTdMSiFCB89qYT0t4YQ8k5RheiNj0Si3MkS7NkmEuWKH9+kFSrqQggh+nMVoccbESU3ugN7t19XECFNTtCKnHV/ifQve1XR8hCiaO1S2FusVZQQsrzwVaY+pNzQ5Fc87ONJFN7SAnnmFkThHr0fveJoSHnktduUMXr9j2CieP0mCnd0jbvSCAn+6wZljN6OJ69useLkhu/idcQJflAAd7mdiBPUvfbdhpMrWhBn7HYQ7nZonYFT/6AY6go7EM71T6IwR3f48A5pa4E585uEe7WHKcTRAxr+Ie/lQVzuO4SD9esg7h89D5EWxfBW3Ixwsds8G7TZ5rjxEal3D9ru1SO8PFaCNWkU4eaYMxTS6KlofhJ62iDN1l3gJ0L2UTij+whXd3gEZw/b8ZVmOpxN1fAVCU+nMEYzwglnCz2LYay4h8BbRNwAY+s1hL8b34Cw640Ih4v9IayfyGNEu0eCLmmXlvB5y7vQdacF4fV+Ztgy9yfc7rPeBlm29T78RuJvQ9admoTnvy6Aq/wvCdd7zKZQRWd78B3xOkNhip7xIrzf9g5M3W5DuF8YZIYoyyCB/4hhlhWerLM8iBoMTaPQRE+HEHXY9CY03WxKVKL40QtYevGhqBaIONEESaZJIlGPhiUSHElLPYiajD5CoYgejSHqMv4qFGXWJGqz810YutuVqE7xazMElX0pqg+iGVIEP0WDRaJGPaZaoMfyl4GoU+9FVtixLvImatV3qwVyLFt9iXqN2g85B2OImg06JkGNlBpM1G2dUxLMSKdqE7X72mkKMfRMbaJ6hfh0CV6k9FqC+iGkaQa8XGhK1HFMmgQr0tlYopbrnZYgRUprQNTzaykUTmhyPFHT4QctUGLZH07UdcwuKNkRTdS252IThJQt9SDq22dqCYUOWjLVj6hx/fel0GEcaiDqXNPrDmzc7aklal3TNRsynr2vIepcqP7polsMNJ+s/aKGqLrcIj9cn1lMGXDSkmsbPo7WqymfTxbflhiQSg9X9QxTR0LY+0vulVAGqNT4cPkH4aLa0dT8/WQpA1jjqb8aaFWMptbgA1YGttLJH2prVIng13ZZloWBruXWyvYBguoI+v6gmQGwJeXnWFXh2W7hgzLKYNiSvaSDl1rQddmYRxkg0/xtn7irgYiBaTYGztLlobGcp6n58xUjA2nTtd9qaTkuYlQWZXB9b3Isp2mqT75rpQyybff/rKXhLyH4twuUwfe1CWECZ4UOv0cZiNPsH8N4yvvjcyYG5qbzn/vxktBwUykD9bIdTQQuipiQKzFgl/L/iOUf7RvHzQzgLf+213FO0LRiBvSlcyJ4Rtsi2czA3nK6tY5fBjxgoJ89hFcCZ5oo7FHTvGAu8VtWxsDfvDqQQ/x22BgC2vYEcIfvIitDQdtyf974zciQ0DSBMzoVMzQseU/gidAjFA9oajhPDKUMEelIjghOZ6h4MYwfvniBCyXduEG7lOICXaXjBY/zDBkvefKCXyk2mAJ4IZJiA4vjhWiGjtV5wd+EDZYgXvDMxIYsL17QrcCGNTpeIJ8U4kLRF4QbvVJw4aQvP5DXMyge0IuNCUcKdf5fTHGAFu+tK/IEIfoPEwsw4MWuj/WEOz0bTTr90AZ50rNzk5t4Ez71av6/HdmU12hZ3oP7uWWU12j2zh/bBhCeFcRaPefsPJtt4SJT7v2raUeT1s0YmdD+NV+xXJ/49gkjp6/auj81Iyv7hcRDtpyMvXN71REFwsMekQ27Dp61KzM7p7DUSjmB2symkqK8508e3bt8fM+auROHJXR5u1n9mhGBXiKxp7tvSFztRi07JwydOHfNnuOX7z168jyvqMRktlFOoNbSwpzszN2zh7zTLM5HIJwtBNbvmDDy75W7jl3JNlKXZMy7n3k+dd+2NYumT/x5cJ/POresG+2rIYrU+EbXeaPzZ70H/zRx+sJ/tu079l/m/TyjS6Km7Cupu1ZOHdm9Y/0ggXC96O7lFxwRU7/Np/1+/HPRxqRjp89dzMy6+/BJTkGx0WKlipGsFmPpi/ycp9kP7mRdv3ox/dyZk6mHdm1YNnvK7z/0T/io45sNasREhYcE+nl76nUicaKiTu/p7RcYEh4VU6P+mx0+Suj/w+9TZi/bsPNQ6skz59IvXr2ededB9tOc/BelRrNVUgy1WozFBTlPHt7Nyrx47vSxpI2L//yx36dtGsREBPt5uYtEhQoG/4hqdRo2f7vDOx9/3q177wGDR/wydtLU2QtXrNmcmJiYuDWp3MMpLycnJSUl7U5MTEzcsHr16pUL503/e/y4n0cO+bZPr4Run3/6QdcOrd9s9nrd+LjIkAAvd5G4eNHdKyAkMi6+7uvN3mzdoesHn37eLaFXn2+HjPx57Pi/p89buGL16tUbEhMTE3cnJSUlJae8fDip3K2JiYmJm9esWDh76qRxv4wYMqB3926ff/xuh7ebN6xTPcLfIBDXCwBWUDggbBsAADC+AJ0BKhgCfgI+nU6iTKW/oyIjkOjb8BOJZ278Tg/pnHNFEXCi/O9yRerwf9o/cL/G/t91U+8fh75Ubn/wPMz62f6H3S/Mz/Q/9X2D/xP+r/83+m/v/9A36S/5/+qe3D/R/th7o/5b/2PUR/NP7z+0P/q+Of0Qf9X1AP9L/gOsl9ADy3f28+Fb+u/8f9yfa7//P/y7AD//9bP1h/0vgV/Uf9t572CASn5P+hcffIX8o/jvQI/Jf51/qt7R1/zC+83p7fEeb/9B/lfYA89u+goAfyz/Cei7o4+vOBOJJHy7sfyCntl5TZx3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3OO5x3JmkOzjOwI+WXlNnHc47nHc47jqUL3fyy+61ldya4CZbt78H8d9/+uN/tkPr51w3FReU2cdzjucdzjrvpSjcKfD43/SQRsug+ytrpYUwplGoX+B3OO5x3OO5uDhMUfOSaMKO+jBmKDHDHMj7HYKPyeyr5urU5+r0YJZYpobP2EaNxth7ZeUzrkJ9c3L3ZC68WuLFjYK3f8SRTAMdX5xyI9xmSlGQUpWAMGAU2cdzjucdzjrsismRpzabNP0e0JqD5EskQuuFysbq7+5bYwH1+wjRuNsPbLymx6j6DMWDJwqsfBKjNzeuUESW0Nequ9mTcAax5x3OO5x3OO5x3Nu/4LWAqvhpzyWQKejXTRqqfdsvAFPbLymzjucdzbo4Zifqb2HUvUw5MF3u/EReBRheV6PZ5rm+8Xnd+xtCn5etphcWwHc47nHc47jAwv+wo6PgjUHRv8P1S+j6ObiRIOVu+6LHc47nHc47jA+F8zmglR0Hxxf4HcdxZAcWzRnn/gtoAp7ZeU2cd1etzozNYYO0M71yYtVJ8gAAl66gCPv/LSPbwffHc47nHcY/Nb28u5zMBISM4SZPoucIWdMVDlXvhI2hUczyAEePEKEqsk5EoCP/wOs5WL2POhVdnE5E9z2Vbkr0z3tQUZP0ShxBAp6WW3TlG8h596D2QYdoXg5t2BQlm/wMMeV6vejlxI3bEH1T8LEWeecmGzCuVnMect/wVtRTKW0dRm5EiVIoPJgC6H2ZgL1E2cfGbzcWgBkLMChYLsbWOub/Q6Z+wjRvLantl5TZx1ln9VQ24qxv83G2Htl5TZx3OO5xl0W65tJv3u0SH0DvnB5aJ0VuMbjbD2y8ps47m0jYtwX/4sInoi1QLBoZCSYTRW9R9t36L79/i2hn1ijFn+B3OO47ciLH936cUXG1Z1aN3XMEFZN2Ah0R5GrLym6uCjqnDcAKFNNbFK9OWE8XTdxRhh57fPUnpJ0OWVtK4HMnkJUU9svKbHtZKG4AUOF5KShvr5FyTt5rISSUbja+wZEffT2vXdRNG42w23KD0FfkFPbLyQrRJ0G4AUOGD9rZeUz5MU9svKbOMlLldw3AChwwftbLymcqQGzLZKNxth7ZH02RobYTriapirA6v8JB6NzBr1v25wuCP2EaNv9yG9ySjcbYe1NqNFpoYvDcB4Y/YRo2/wUiw3+B3OO5xkOTo38gp7ZeU2caeFQbLqO5x3OO5t3oePyU2cdzjucdx5g3uflNnHc47m3YWmsh9D9hGjcbYemWBPjyCntl5TZxk8/rXGfLEo3G2HtlydQQdtPGMGU2cdzjucZGy4GxFG82U2cdzjuRB/JZPkUsAps47nHc4654Y+d5aqdHqe2XlNAMqkxJOxg2w9svKbOOsdaQT8YV6pJVqb2TFGFMKZjYRo1k3n/1qj+O+EX/y9pKCGhuNsPakloYkkfVEwxQSL/V+rmMZ64E+A2gPi1NoMq/W+4hyRzmMvll0fBumbIETl/n9NheEdF4WH2lc7tbLxgJ7VKl6B1nijiPtB/7xqZLT2BO3ZFZka0JZ6EyHaczt31//tej/f2w3b+mR+wjH+fbB6qfSlX5CxGqU/BBPe6HzOKnlTaHyINtKaVINSUccF1Hc9VSep5nDVG8GrltMLN4kcAD+7vgAAAAAAAAAcjd5wmsrl7vpOPTgDOyy9saD60cnZH6K6Xz85b2m/JGG8AZozcicRHHkL13V9T06Gy1HwV8hEjxPdXlqO3F+XQV8T33NjlOoaN1BjN8oigAa9MZrih3lL6V7oOEVRcboQpwa7B3VnJ1BLiOes56owY++v6PZqpo92ATdEC4aHwe10SHbfuGG9pZdWXSEjXJxyDix4u3mYOnzQGsbCW37f8gDhruF1dr5C915xm5E6qwevRUsSjLXPk2IZamaafupUA+Wo69SDBF6LTZDlykYN+okDN+EZA05oSs4X3DxTZYwhSIpE7zgfknX1x/rE4M9O2oxud0dglmc0dPxnh9/+feCi4vtT5uOr7UfEyB/I8ENrGwInHBdjgL5FrxEiIaauFPVw7SYWkqAu4FkWwfvaO/H+SAgTqYZzmMvAo7loxMiTW91XNCP+PPrkxosL1iexmv/3okzIsCFx/rprNSZrvqj3CmDJHZ4yYGyYaGqwkCG4rL6mJW1w54L7NnzLAxISS/clATvATq7MQxWDJ+4maEpg0M3gzcCfVfzMyMpGNnGJGLHpeflX36BPu5NCcKizP9V8M0JbhRJMAehBeWOoqlifK/Sde8cbreqscAcnput/XNun3pXPVtQmMQgskhuku8lP83DNsvwF9U/0tmeUrARBZ54R3KBmITf72WY70i9yjXQZGxCvQPG2QAgVKLmOWNxJ9TO1Nf0QJIJyP464skaKKzsbiRydLzGJWGNKlc9rbafmqpbfjDw9Ed8/J8sRfCAz+gJbldwEjgO7JzSVCVWKB7S6v8cjPTeb7PeW1Itpi7otej7Di/e9OhCzWSRGyo/MzA1kQkvkC6EmztlGN69TDXgDwaycALQAEyWDYAbWkdUPO2bJ3aNb3K/Tgf8e1RNfxqtBun+eJrSEJtlGEfCdB3WZdIhzn6755AGuDdji2HnmVlzRy6pwMpHHaLjgexmZc0cf/vlFKjzyX9wEKcndKP62/sA5iuSw5p7FiYijOkIP9fwD2bRaqlTBwVUEphjHaRQLO/kC4n0qelQp/qkt/MPjx1ynNhbTBRgLXXPNxhfsJeBJumw3mifBQoPKXnhUUmjWYGjVGkIdKBqSaINw7MtauhneOCwNE+haPjpE3U9nVW0mUJUQwnZVJ/+48LVYcVPnstcE4AP+vOZmmv/JeFio7ryBoa/wv2UOQt6ihwJQa6UcZaqBtQA+kCjBqRp+2yPCDbGs43Jkseq7cuoTTaAu+RX2o5/zb8bEfO04G3ZBzRiCsJdvpKamf8Tdvke84J33cyiAaIFEHXr8SlIOhStR6raVnjmSeLDlgdxMV+fMPQOdB0y8BKj5O92JI96aBuN5CjNq+9rQ6U4ABBgYltuaXdJW6ZJYtirnY8v5E4BkiTbkws8ksnrqMcyRtsZkrqIJmhWkGGr66WrasvRpr8NJMp01KitD6SRU/U/nUDQJ66qr/fCbjbMyzpEsHhiSP5RM8RmVSf2V1xQZNtbaHuK+bq6DFwmSmU0euf+F8RVj90JJl8q+7CxK38oE6Q/qL0p4eWUMa5lWp2rVWrhl0hujAN+E4litkEm4ovCQ45O7jSqVsBUhZJt6z6kxCvmVLU/LZIlBXagtTRgEwq/HwktZxzsYYmq4To+nAeoCsL+b4addAmHO30ZIXeszaeCCyOpU43XX4NxG6R3ztkxMBh0Cz3QCRgYsvLZsZl8hgAbRROavqYLGtiNMJj4cog+wKjZ0RbiyGabkE8PfZkaTo0iv7SVD/g5r/8rDfWGwZWGpdooQemIBwaTquEUSYnpfbIsgACA2GGl6Pp++HalAhnqWr2YcqhjeGCV/EHF/5IRJJwo7+52djV+XmclrzPtm755SSUC561gg9XWsEIC1Cfn1iX/rhI7PpMTPoXkXHuB09HBYi+iiqWzW/8NXnm+tFWz5g5h+vWuRStl4doagwnFbx65DgaBo0zgVFq9g7LhDbtoaPynnUlJpH63LV6OACcYG2SboGxekq3+VxoY7uUJN+ncaJwUIoBk3BLl7Vmm28um4E/WuRv5qt8s4YSOFi4GIwxD/GKoN8xrhtNsN5s4W6Zq0CbNmK6EFD+IiRXCLVzMksb6iWV1MZVCoItUqH0fuTo4+2CKMAo6VJ26DyDHaJQ11KiC8DMMXBp2dDIZHZyueo4Q83RSQKct/uxIAopPshlYwLbo19FuYzs9X2RRtePrVKh04J4Jv61yBsnCEo58X6Z92iF9rGzOKmXlwy84aA2fG4dTyHfdLcbDLnhHRdUztZdkpj8/fWqL64agCvcGNpuyn4c+a9cqxKwHYvwbz7C4UhxdWWIJDpYzNy/fEvDLWYoK9LoNhV5qHt2uYUgqu+SSv84kqHQEFja4Tl396PAiUuZ5jHsR2+0R+MweKWqFTxoNcXF7ZATfZXrQ2GelSWBqNHr+wW/X52McsLq2IcjyehgwaSRVI/qxT0ZiXp3juRdOUA8ysItpo4i9krD2YDMN3+8xWOWUoXLFl3aM3d8sCpfMniyWYuQ01YAUh7S9O6Nrs8MSfKDChATw2SWfpBhK5fPrC+vJRs6iWqEqEAnZJ5WVYYBTWmvoz4ZatKQLgux6z6C0vOMKE5UAR/d4IIAy4HkZLkgY7vxoGeY3MM20+jPvqehx2pA7Jb40n+LdZG0bRnzqcFhQofqb4G4jlvAVFIWLqzYpzbSUkYaguNi7/nbTBcVYvf76XynWfhafQbodx3Nac7TF+YJqulv3GuV1/KzwsNXc3l0J2jDLy0uT39C+9KmaaRZl8xqws4TyGpmDZJYcdvGXs5bKbO2O+XRNcAj394AC36tz1XTT81NDvmoYUh2gKK0w1HUDInLqWRm8vQB5Wq6DlgjJ4Xc/VRMoEKvR8jg/MonkTDkMXa8c9+/Ib0nHyhFZ8eTKL8GcER5cNROU1Or0xCVzIF0io2BVP0zgC9NDfM0vg2sKnGBmsrr5xJ5hDhrxNXI8dbfmbGxQGScoLm12mUoVnM7w7b/7Mrg4nTg8/c3I0wp+7XmfjwZuuGTO5U88vEr4gYIbIznjF+m6L5kxckqegRlba9VjfVhXJq27DCwEKSPhKYcCbpV2tv3CTCekBCT4J9/aq2jjlEhS8fShKKzW5u1vtsc2SuUaamRgBu1JyLsCBukcGX8b18OGVd2m7am1XNGb6NUc5rx75tVRyEFoFptr56ookhV8hLpkP2mbeeQkIDchZdH+OM/6YIS6zrbtdBRPHDFo4sl9E9TnYMK0x+RN56p9CcvtLriYF7EZtwpx04Z9MJSax+gmiivPlq1UO5MEorKHCiVb6AAFTQu1TZyZQhm31GPRQjnP0+RFWialE/ifQfJ5+rk2J6D16m+tXFj8EgqRFWASK3mYxP4dY1tcNuhCLTfSnjxjgYVQ4O2mLNW5LZhz4qwcG4aSX3uZx3IRawn1PAg3FBDno20BiUioBU73MbJ2ecvg07bJlY6e4hIs21R7qgraOCPOCX9pA0BlGHswT3q/yRJLN4mSsueaDB06FPbtealgvSTnL9NsiUVS2Z8/EA/Iyz3qiYdhZqHL3sjLVfbAro3f8Zhczf7PbqY3vOq0rvCZ3gRgOnpDi8gyjJnH8H1/Gr2eRBaXFHLIUpGjmqoHG5qFFfRb+14dPFTsUsZnOwl+HqtL2pP6rK5s97Uw++sUABfADrxkVKOn+FJHvyX/tqvFb5JEsEENf9fpGi3uOSNWL+WCYaHeNuKI9E5OyfXrzVWS3fhV3vBulTlMbtBwjRPLu5Lrhdo7aqqNe2rUk87gSiOO/5HHCMWqUvd6OkwDPFZCTm5yW3dJqH8ExXjuY/citORf6J2DfVvkCwVyVqbInb8fEBrJgPzECgy4CokhWS3tIZcfOrI74e2K3c4rGvDy2BEzUbzg1PT2I4MQmdwuaaZhTIewKTsb8VcJUxzzCmODGghlE7zRPUqVQAsVI3zsMFk7WEKwmr0MwfZnQJF4qtaU43ntKDKGJejyAzI25cw/jjdkABUj8/M1MFxpmkBkZf48Z9Bby3Q2VKAF/HcOYOXERKMGxxmwC01eiTUdqosMtMGDjCToJ3cgyDAdF+efQCk10FbR9KbIgStdcwPMJ+K6PSxaPK+w5QLErUqUPfixBNUOhzuml+/V6RcF10CF8L37O2sXcGAedbOrh5ck3hI3RmOHRlPktuV5XqcSY51mvQF6pc+j3OzHD9mCvcXUpDHF/7RiOFO8bcSlYVXiIy9nPgCupKez4MMMAbb4ddWslYvpGX9sNicOCRBUTEAH0ITGAAZI83Y0wwe57IJFVuZsap9J/Ub1RTql2GJFP5V6Nkh4bZWbWoc+VcsYLq9i8i+3mwstF7ykm0QPs9i4Bv6QK3PtTjUyecHyexf9v2SCCpgyFo4QEibRKOc0JAHNCAeo2ZQKoNuUrLtHYnxMyGyeIivmDFqebjlhZURmVJzpaMH/f/BvC3zpEayQ5LA8D634DR40YXNC471K4Hc3ILC9rEE3dZ7kjoeVxuCJ2AD7sRNUPFNnQqAMP9EMxvqbOV7sDPTwCnG6q1sKjA7GLXaLAbPZfJESqRMJGFoOhhaKx9j6YtbUu4S9MGlwGLJpML2v5JZC7PsDprl024RD7uw16C0BwSmvMs+1hdYFSU5vwAUttwpvfU7FmEonVv9pbSFDr8cw5BXbIL/v2LlG50wfhhXxNfaB2YHoey05ox/ZLulSgAA3VbqpQOV1jLbUaoQK7gQCFxwuuF6gQBIVD3PBHAnTys4ak11+3lwFSe1N3KyC6W3HMN6Q6HpfJTHql0ECvbtxhdZR5Z/7w2f5K2VfZYdUeqHyTFqJ1MWwaVDR6iTXsWSEHA6HQHAHhGTP0yt4IM8mHFly0hf6/5DEh7sfRKb2rq03PCeYcJgjuDlQA2dOGhhDD2fIyUVy+wb7wIQ0zW0E6VJ3rscf2id9ZU6Xjv4kGCa/x2/+/Ss0lQgtPbvwIcO2byRsej66WGFfjJPq8ucTAELzPavMGGOCZz4bXhdFoZ5YCFOOk6g4E5Sst9QVoe+KmulP89lAt2cyQqHnbZll9L672XMMojBixavLbjO4AABBxAllPciA1RFR5kXVVWUZqg2DR9JmAD4x4y61qLaDCaf1+F3RuHBhpubUZfkIEr5RVMo/jq5AW1y9ajqvqk8bKKItkuyp2D8hnKLPJRLTLO9Ib7Ut/XdATUbGJaxMLcOspRY8ieeezY5xtUyerRPgh1QotSMHMamQS7CW+66fuagwJysdE5b51HkG8Dq52R29JLFgKAj8Uf7M+WqY7ftD8TbJpsW0tCiQEVTnw99dYyNH48cppQde/VxsEInCgLbxIZuOK/DFzAkuhhWFcI8tdv7diObB8scgXyfLjSf7AUiqCxIl0X8SzzrZX3pqdAb7dEk7r1b5EFgYfX31sdKfAtD7kqkpj0kHn8xswMyqLenFKTRvkoIcGib5ZFfQMeHAmrRX7QLhQBIMdvtRwx8XN514iIQYruH5agIHvXqDBVoTH31OpyZ6RJ7oE6Ds/kSZUapQSnjJF5gwgvYI10Clr2gW+n/Ec5bVyOD00W+seVc7hwfI5HLMkk1neXdwgBPV1ukLC/wp+JkARGbDXRqYQS3U9LMubyOK7/l3YEYh+G+tln/OXHtuoFFukv+D8Yqx+TL0YYZkFaWhNURsWuqdTFYlfvK2ZnAvU1WsXuGfCywYZqz50hd3DC6nWNHdgTE5/EPA1mgrHGW7CdBxklcTwvS9tSnL+WnNY1Tr6yTFK4RSbQ3/iISXwaanY6A3jDpEwWVSlQmdLRnvZK9wuJtUqHHlG9Dl+uphf1Dt4sya4JmyNLqT/P+qWCHOmzf0dAe5A7knftoYJCoBL5w7q+c+WnPa8BxNi/7MHmoFDPmnjRL3qd5I9dAv4OxsIABDbYE/CRuzWw1fObdBOTDXAsziK0N64uUFdBLZAbXwbvi5ZawEAfS+hjQvS0nuXapw1wfbbWxq7KJ9+E1AHvFbBkQQp34ygA7sOif+ZOi13ErbHh7SZ2DLRdfFA6YFOfiyfDZwPXIB84qMuoIaTmKhgN0oYHJmT19DYvFT7KTl+XouHXnUZGurVWUO4f58yhYotCedy88HjsSlXxRB8iyLCo+1OSBesm9J0kw9XBL/yyMJdWduU4sh/9vDTipjYO/FqvVzYXpxmsat0n5+3Ffz2rS43Vd2fUjrdml/lZd3eVEL2Bu67Cy/tIzQGZMpbHi6TgbvKxoWPwSJiIMG/qDhDlRZk276RvbKi2CRj1bdSfxhmCxtLcP7+OqCAXrBkVxMH8cwddbiQlVimpx+nlLJ/X9zTVVrD/kKhCjRYupl5e1Y9EQkv8npxItO4ZCZTfm4Cg8tNAYdwRZDCHYA9pqygxWTy1WrECmPibm/IaJxma6LqRen0vHV2angL6pf/+NdtGtpZZrLs6h7yc6DOrfVPvqUbl3c514v4oepa+z/PhdqFp/FAZQd/Pkvc1LkBcGcQ5Qfc6AjohtnQUfFSApUb2f6XZISAlGdYnDrkTgubXOYKNG/z/LF3vTbV1YjmP8/XZr+Uc/DPrsfOIOj6ldu7tnr6aB/iuHL9Noizhn2eiTOe5gUqpij68t4dWAXvosGMpl7oN+9bC74wfq4WNo6fUgUBzrMGL/scMlHGXdIFJIa0uOLldo0A3AOZXTZC6PN1fXAsGnL5z1wyWZvUL67lTPXOaQdnOgRLj2MC1cjc53d6D9/jXzaZR5B9HCpAdB/CAmBSZJIlwj1DbWiNviUAGrT//xxv9yCFJYfbg28WE1fuQNJbycnh9WizKIz3PYilTzfUNC0rrmithaOVDJ5Q9142TSYAAJeL9QE7DvuUe0rIBAElcoS/O5z3sVYfrQde+maQ29RgXR9k4f08nJMu5/nLfvQp4LlYtbnlwh164nZmYC1VG0+YZGNYoYvI0zfzPvRWE9/gaYcx7N1UH7R2nnb77/7MQzsg8w6ckeUIRw4SE6U24MTJ/tYHNUYlvzxDHBCpNO6EPlR69d3G6xVhDs3UfTnxkkPLXdbMVNKtH8KwL2uACPsAmbw/dEM9UdKfjxQwaY6xCUUeMzVz5KMoh9ptELuPIkGg9KcgldaA8FLdOnN3/BzfBuMltFl1v693ovLuTyzUtpBEmspfaQd/UOYQxVrgFVy0I2MLiqC24PstA5telnAhmxpvyRCAFDXsFK06POc4NjrxQFKElKG38PbodMsXQ8fSJcO8lQis8+QUuT6FsUwMZS6QM3iVoXMwmjiQK+zEjccRZYOuCn84u69rB9nyJE9+L6qPMn4Oa2Ei1dbyilJBWgQXxxrmCAAAA==" />
                <span className="text-[16px] font-medium text-slate-900 dark:text-white">QQ</span>
              </div>
              <button className="text-[14px] font-medium text-primary hover:opacity-80">
                去绑定
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 px-4 mb-8">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg border border-[#ff3b30]/30 text-[#ff3b30] hover:bg-[#ff3b30]/5 active:bg-[#ff3b30]/10 transition-colors"
          >
            <span className="text-[16px] font-medium">注销账号</span>
          </button>
          <p className="mt-3 text-[12px] text-slate-400 dark:text-slate-600 text-center px-4">
            注销后，您的所有个人数据（包括简历历史）将被永久删除且无法恢复。
          </p>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-300">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !isDeleting && setShowDeleteConfirm(false)}
            ></div>
            <div className="relative w-full max-w-md bg-white dark:bg-[#1c1c1e] rounded-t-[32px] p-8 pb-12 shadow-2xl animate-in slide-in-from-bottom duration-500">
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>

              <div className="mb-8">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">确认注销账号吗？</h3>
                <p className="text-slate-500 dark:text-slate-400">
                  为了您的数据安全，我们为您提供两种注销方式。
                </p>
              </div>

              <div className="space-y-4">
                <button
                  disabled={isDeleting}
                  onClick={() => handleDeleteAccount(false)}
                  className="w-full group flex flex-col items-start p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 hover:border-primary/30 transition-all text-left"
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-bold text-slate-900 dark:text-white text-[16px]">冷静期注销（推荐）</span>
                    <span className="material-symbols-outlined text-primary text-[20px]">schedule</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    账号数据保留3天，期间可随时登录恢复，3天后自动永久清除。
                  </p>
                </button>

                <button
                  disabled={isDeleting}
                  onClick={() => {
                    if (window.confirm('警告：立即注销将瞬间清空所有简历和账号记录，且绝对无法恢复！确认继续？')) {
                      handleDeleteAccount(true);
                    }
                  }}
                  className="w-full group flex flex-col items-start p-4 rounded-2xl bg-white dark:bg-black/20 border border-slate-100 dark:border-white/5 hover:border-red-500/30 transition-all text-left"
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-bold text-red-500 text-[16px]">立即永久注销</span>
                    <span className="material-symbols-outlined text-red-500 text-[20px]">delete_forever</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    点击后立即永久清除所有云端数据，无法撤销。
                  </p>
                </button>

                <button
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-4 text-slate-500 dark:text-slate-400 font-medium text-[16px] active:scale-95 transition-all"
                >
                  取消
                </button>
              </div>

              {isDeleting && (
                <div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-[2px] rounded-t-[32px] flex items-center justify-center z-50">
                  <div className="flex flex-col items-center gap-3">
                    <div className="size-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-sm font-medium text-primary">处理中...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AccountSecurity;
