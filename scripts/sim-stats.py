import random; random.seed(42); RUNS=1000

# ============ fight functions ============
def fight_phys(ehp,php,mt=6):
    fury=0;e=ehp;p=php;b=0;dmg_out=0;dmg_in=0
    deck=[(1,10,0),(1,10,0),(1,5,0),(0,0,4),(2,14,0),(3,25,0)]
    for t in range(mt):
        if e<=0 or p<=0: break
        atk=random.randint(5,14);d=atk-b if b>0 else atk;b=0;p-=d;dmg_in+=d
        if p<=0: break
        e2=3
        for cost,dmg,f in deck:
            if e2>=cost and e>0:
                e2-=cost;dd=dmg+fury*3
                if cost==3 and e<=ehp*0.25: e=0;break
                e=max(0,e-dd);fury+=f;dmg_out+=dd
        fury=max(0,fury-1)
    return (e<=0,dmg_out,dmg_in)

def fight_bleed(ehp,php,mt=6):
    bleed=0;e=ehp;p=php;b=0;dmg_out=0;dmg_in=0;heal_out=0
    deck=[(1,3,4,0),(1,4,5,0),(1,0,5,2),(2,12,10,4),(2,10,12,6)]
    for t in range(mt):
        if e<=0 or p<=0: break
        atk=random.randint(5,14);d=atk-b if b>0 else atk;b=0;p-=d;dmg_in+=d
        if p<=0: break
        e2=3
        for cost,dmg,bl,hpC in deck:
            if e2>=cost and e>0 and p>hpC:
                e2-=cost;p-=hpC;e=max(0,e-dmg);bleed+=bl;dmg_out+=dmg
                heal=int(bleed*{2:0.2,4:0.35,6:0.4}.get(hpC,0))
                p=min(php,p+heal);heal_out+=heal
        if bleed>0 and e>0: e=max(0,e-bleed);bleed=max(0,bleed-1);dmg_out+=bleed+1
    return (e<=0,dmg_out,dmg_in)

def fight_poison(ehp,php,mt=6):
    poison=0;e=ehp;p=php;b=0;dmg_out=0;dmg_in=0;reduced=0
    deck=[(1,0,5),(1,6,8),(2,0,10),(3,0,15)]
    for t in range(mt):
        if e<=0 or p<=0: break
        raw=random.randint(5,14);red=min(int(poison*0.2),int(raw*0.6))
        d=raw-red-b if b>0 else raw-red;b=0;p-=d;dmg_in+=d;reduced+=red
        if p<=0: break
        e2=3
        for cost,dmg,ps in deck:
            if e2>=cost and e>0: e2-=cost;e=max(0,e-dmg);poison+=ps;dmg_out+=dmg
        if poison>0 and e>0: e=max(0,e-poison);poison=max(0,poison-1);dmg_out+=poison+1
    return (e<=0,dmg_out,dmg_in)

def fight_control(ehp,php,mt=10):
    c=0;imp=0;stasis=0;brittle=False;e=ehp;p=php;b=0;dmg_out=0;dmg_in=0;skips=0
    deck=[(1,5,1,0,0,0),(1,7,0,0,0,0),(1,6,0,1,0,0),(2,8,0,2,2,0),(1,0,0,0,0,6)]
    for t in range(mt):
        if e<=0 or p<=0: break
        if c+imp>=6 and not brittle: brittle=True
        intent=random.choice(['atk','atk','block'])
        acted=True
        if imp>0:
            if stasis>0: stasis-=1
            else: imp-=1
            acted=False;skips+=1
        elif c>0:
            if stasis>0: stasis-=1
            else: c-=1
            acted=False;skips+=1
        if acted and intent=='atk':
            d=random.randint(5,14)-b if b>0 else random.randint(5,14);b=0;p-=d;dmg_in+=d
            if p<=0: break
        e2=3
        for cost,dmg,cha,im,sta,blk in deck:
            if e2>=cost and e>0:
                e2-=cost;c+=cha;imp+=im;stasis+=sta
                dd=int(dmg*(1.5 if brittle else 1))
                e=max(0,e-dd);b+=blk;dmg_out+=dd
    return (e<=0,dmg_out,dmg_in)

def fight_guard(ehp,php,mt=12):
    spikes=0;e=ehp;p=php;b=0;dmg_out=0;dmg_in=0;blocked=0
    deck=[(1,7,2),(1,8,3),(1,10,0),(2,15,4),(3,25,6)]
    for t in range(mt):
        if e<=0 or p<=0: break
        atk=random.randint(5,14);d=atk
        if b>0: bl=min(b,d);b-=bl;d-=bl;blocked+=bl
        p-=d;dmg_in+=d
        if p<=0: break
        e2=3
        for cost,blk,sp in deck:
            if e2>=cost and e>0: e2-=cost;b+=blk;spikes+=sp
        if spikes>0 and b>0 and e>0:
            r=min(b,spikes*3);e=max(0,e-r);dmg_out+=r
        b=max(0,b-1);spikes=max(0,spikes-1)
    return (e<=0,dmg_out,dmg_in)

def fight_spell(ehp,php,mt=8):
    mark=0;spirit=0;stun=0;e=ehp;p=php;b=0;dmg_out=0;dmg_in=0;tribs=0
    deck=[(1,7,1,1),(1,3,2,0),(1,4,2,0),(2,18,2,0),(2,10,3,1)]
    for t in range(mt):
        if e<=0 or p<=0: break
        if mark>=5: e=max(0,e-40);stun=1;mark=0;dmg_out+=40;tribs+=1
        if stun>0: stun-=1; continue
        atk=random.randint(5,14);d=atk-b if b>0 else atk;b=0;p-=d;dmg_in+=d
        if p<=0: break
        e2=3
        for cost,dmg,mk,sp in deck:
            if e2>=cost and e>0:
                e2-=cost;dd=dmg+spirit*4;e=max(0,e-dd);mark+=mk;spirit+=sp;dmg_out+=dd
                if mark>=5: break
        spirit=max(0,spirit-1)
    return (e<=0,dmg_out,dmg_in)

# ============ simulation ============
floors=[22,30,40,52,65,85,110,140,175]
names=['Physical','Bleed','Poison','Control','Guard','Spell']
fns=[fight_phys,fight_bleed,fight_poison,fight_control,fight_guard,fight_spell]
turns=[6,6,6,10,12,8]
labels={'Physical':'Big DPS','Bleed':'Blood Magic','Poison':'Weaken DoT','Control':'Lock&Burst','Guard':'Turtle Tank','Spell':'Thunder Trib'}

print(f'{"Arch":10s} {"Win%":>6} {"AvgF":>5} {"Spc%":>5} {"DmgOut":>7} {"DmgIn":>6} {"Ratio":>5}')
print('-'*55)
for name,fn,mt in zip(names,fns,turns):
    wins=0;spec=0;tf=0;dmg_out=0;dmg_in=0
    for _ in range(RUNS):
        hp=70;relics=0;sa=random.random()<0.1;clear=True
        for i,fhp in enumerate(floors):
            w,dout,din=fn(fhp+random.randint(-2,5),hp)
            if not w: clear=False; tf+=i; break
            hp=min(70,hp+3);dmg_out+=dout;dmg_in+=din
            if random.random()<0.1: relics+=1
        if clear: wins+=1; tf+=9
        if clear and sa and relics>=2: spec+=1
    print(f'{name:10s} {wins/RUNS*100:5.1f}% {tf/RUNS:5.1f} {spec/RUNS*100:5.1f}% {dmg_out/RUNS:6.0f} {dmg_in/RUNS:6.0f} {dmg_out/max(1,dmg_in):5.1f}')
