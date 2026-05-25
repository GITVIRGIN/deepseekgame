import random; random.seed(42); RUNS=200

def fight_phys(ehp,php,mt=6):
    fury=0;e=ehp;p=php;b=0
    deck=[(1,10,0),(1,10,0),(1,5,0),(0,0,4),(2,14,0),(3,25,0)]
    for t in range(mt):
        if e<=0 or p<=0: break
        p-=max(0,random.randint(5,14)-b);b=0
        if p<=0: break
        energy=3
        for cost,dmg,f in deck:
            if energy>=cost and e>0:
                energy-=cost;dd=dmg+fury*3
                if cost==3 and e<=ehp*0.25: e=0;break
                e=max(0,e-dd);fury+=f
        fury=max(0,fury-1)
    return e<=0

def fight_bleed(ehp,php,mt=6):
    bleed=0;e=ehp;p=php;b=0
    deck=[(1,3,4,0),(1,4,5,0),(1,0,5,2),(2,12,10,4),(2,10,12,6)]
    for t in range(mt):
        if e<=0 or p<=0: break
        p-=max(0,random.randint(5,14)-b);b=0
        if p<=0: break
        energy=3
        for cost,dmg,bl,hpC in deck:
            if energy>=cost and e>0 and p>hpC:
                energy-=cost;p-=hpC;e=max(0,e-dmg);bleed+=bl
                heal=int(bleed*{2:0.2,4:0.35,6:0.4}.get(hpC,0))
                p=min(php,p+heal)
        if bleed>0 and e>0: e=max(0,e-bleed);bleed=max(0,bleed-1)
    return e<=0

def fight_poison(ehp,php,mt=6):
    poison=0;e=ehp;p=php;b=0
    deck=[(1,0,5),(1,6,8),(2,0,10),(3,0,15)]
    for t in range(mt):
        if e<=0 or p<=0: break
        raw=random.randint(5,14);red=min(int(poison*0.2),int(raw*0.6))
        p-=max(0,raw-red-b);b=0
        if p<=0: break
        energy=3
        for cost,dmg,ps in deck:
            if energy>=cost and e>0: energy-=cost;e=max(0,e-dmg);poison+=ps
        if poison>0 and e>0: e=max(0,e-poison);poison=max(0,poison-1)
    return e<=0

def fight_control(ehp,php,mt=6):
    c=0;imp=0;brittle=False;e=ehp;p=php;b=0
    deck=[(1,3,1,0,0),(1,7,0,0,0),(1,4,0,1,0),(2,6,0,2,0),(1,0,0,0,6)]
    for t in range(mt):
        if e<=0 or p<=0: break
        if c+imp>=4 and not brittle: brittle=True
        intent=random.choice(['atk','atk','block'])
        if imp>0:
            if intent!='block': imp-=1; continue
            imp-=1
        elif c>0: c-=1; continue
        elif intent=='atk':
            p-=max(0,random.randint(5,14)-b);b=0
            if p<=0: break
        energy=3
        for cost,dmg,cha,im,blk in deck:
            if energy>=cost and e>0:
                energy-=cost;c+=cha;imp+=im
                e=max(0,e-int(dmg*(1.5 if brittle else 1)))
                b+=blk
        c=max(0,c-1);imp=max(0,imp-1)
    return e<=0

def fight_guard(ehp,php,mt=6):
    spikes=0;e=ehp;p=php;b=0
    deck=[(1,7,2),(1,8,3),(1,10,0),(2,15,4),(3,25,6)]
    for t in range(mt):
        if e<=0 or p<=0: break
        p-=max(0,random.randint(5,14)-b);b=0
        if p<=0: break
        energy=3
        for cost,blk,sp in deck:
            if energy>=cost and e>0: energy-=cost;b+=blk;spikes+=sp
        if spikes>0 and b>0 and e>0: e=max(0,e-min(b,spikes*2))
        b=max(0,b-1);spikes=max(0,spikes-1)
    return e<=0

def fight_spell(ehp,php,mt=6):
    mark=0;spirit=0;stun=0;e=ehp;p=php;b=0
    deck=[(1,7,1,1),(1,3,2,0),(1,4,2,0),(2,18,2,0),(2,10,3,1)]
    for t in range(mt):
        if e<=0 or p<=0: break
        if mark>=5: e=max(0,e-30);stun=1;mark=0
        if stun>0: stun-=1; continue
        p-=max(0,random.randint(5,14)-b);b=0
        if p<=0: break
        energy=3
        for cost,dmg,mk,sp in deck:
            if energy>=cost and e>0:
                energy-=cost;e=max(0,e-dmg-spirit*4);mark+=mk;spirit+=sp
                if mark>=5: break
        spirit=max(0,spirit-1)
    return e<=0

floors_list=[22,30,40,52,65,85,110,140,175]
names=['物理','流血','中毒','控制','龟壳','法术']
fns=[fight_phys,fight_bleed,fight_poison,fight_control,fight_guard,fight_spell]

print(f'{"流派":6s} {"Boss":>6} {"均层":>5} {"特殊":>6}')
print('-'*35)
for name,fn in zip(names,fns):
    boss=0;spec=0;total_floors=0
    for _ in range(RUNS):
        hp=70;relics=0;specActive=random.random()<0.1
        clear=True
        for i,fhp in enumerate(floors_list):
            w=fn(fhp+random.randint(-2,5),hp)
            if not w: clear=False; total_floors+=i; break
            hp=min(70,hp+3)
            if random.random()<0.1: relics+=1
        if clear: boss+=1; total_floors+=9
        if clear and specActive and relics>=2: spec+=1
    print(f'{name:6s} {boss/RUNS*100:5.1f}% {total_floors/RUNS:5.1f} {spec/RUNS*100:5.1f}%')
