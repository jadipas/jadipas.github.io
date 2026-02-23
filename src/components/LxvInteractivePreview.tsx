import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

type UrdfOrigin = {
    position: THREE.Vector3;
    rotation: THREE.Euler;
};

type UrdfVisual = {
    meshFilename: string;
    meshScale: THREE.Vector3;
    origin: UrdfOrigin;
};

type UrdfLink = {
    visuals: UrdfVisual[];
};

type UrdfJoint = {
    name: string;
    type: string;
    parent: string;
    child: string;
    axis: THREE.Vector3;
    origin: UrdfOrigin;
    lowerLimit: number | null;
    upperLimit: number | null;
};

type ParsedUrdf = {
    rootLink: string;
    links: Map<string, UrdfLink>;
    jointsByParent: Map<string, UrdfJoint[]>;
};

type JointControl = {
    name: string;
    type: "revolute" | "continuous";
    axis: THREE.Vector3;
    motionGroup: THREE.Group;
    lowerLimit: number | null;
    upperLimit: number | null;
    angle: number;
};

type LoadedRobot = {
    robot: THREE.Object3D;
    missingMeshes: string[];
    endEffector: THREE.Object3D;
    controlChain: JointControl[];
};

type EndEffectorPose = {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
};

type PadCommandKey = "front" | "back" | "left" | "right" | "up" | "down" | "yawLeft" | "yawRight";

type PadCommand = {
    label: string;
    axisHint: string;
    translationLocal: readonly [number, number, number];
    yawLocal: number;
};

const URDF_URL = "/fr3_with_hand.urdf";
const END_EFFECTOR_LINK = "fr3_hand_tcp";
const PACKAGE_MAP: Record<string, string> = {
    franka_description: "/franka_description",
};

const LOCAL_Z_AXIS = new THREE.Vector3(0, 0, 1);
const TRANSLATION_STEP_METERS = 0.014;
const YAW_STEP_RADIANS = THREE.MathUtils.degToRad(6);
const STEP_MM = Math.round(TRANSLATION_STEP_METERS * 1000);
const STEP_YAW_DEG = Math.round(THREE.MathUtils.radToDeg(YAW_STEP_RADIANS));
const PAD_READY_STATUS = `Pad ready. Hold a button for continuous motion. Step size: ${STEP_MM} mm translation, ${STEP_YAW_DEG}\u00b0 yaw.`;
const PAD_HOLD_REPEAT_MS = 60;
const PAD_HOLD_STEP_SCALE = 0.45;
const PAD_COMMAND_RETRY_SCALES = [1, 0.65, 0.4];
const TRAJECTORY_UPDATE_MS = 50;
const TRAJECTORY_PERIOD_SECONDS = 9;
const TRAJECTORY_X_AMPLITUDE_METERS = 0.022;
const TRAJECTORY_Y_AMPLITUDE_METERS = 0.016;
const TRAJECTORY_Z_AMPLITUDE_METERS = 0.01;
const TRAJECTORY_YAW_AMPLITUDE_RADIANS = THREE.MathUtils.degToRad(8);
const TRAJECTORY_TARGET_RETRY_SCALES = [1, 0.7, 0.45];
const TRAJECTORY_MAX_CONSECUTIVE_FAILURES = 14;

const IK_MAX_ITERATIONS = 32;
const IK_JACOBIAN_EPSILON = 1e-4;
const IK_POSITION_TOLERANCE = 1.2e-3;
const IK_ROTATION_TOLERANCE = THREE.MathUtils.degToRad(1.5);
const IK_ROTATION_WEIGHT = 0.3;
const IK_GAIN = 0.22;
const IK_MAX_JOINT_DELTA = THREE.MathUtils.degToRad(5);

const FR3_HOME_ANGLES: Record<string, number> = {
    fr3_joint1: 0,
    fr3_joint2: -Math.PI / 4,
    fr3_joint3: 0,
    fr3_joint4: -3 * Math.PI / 4,
    fr3_joint5: 0,
    fr3_joint6: Math.PI / 2,
    fr3_joint7: Math.PI / 4,
};

const HAND_FRAME_COMMANDS: Record<PadCommandKey, PadCommand> = {
    front: {
        label: "Front",
        axisHint: "+X",
        translationLocal: [TRANSLATION_STEP_METERS, 0, 0],
        yawLocal: 0,
    },
    back: {
        label: "Back",
        axisHint: "-X",
        translationLocal: [-TRANSLATION_STEP_METERS, 0, 0],
        yawLocal: 0,
    },
    left: {
        label: "Left",
        axisHint: "+Y",
        translationLocal: [0, TRANSLATION_STEP_METERS, 0],
        yawLocal: 0,
    },
    right: {
        label: "Right",
        axisHint: "-Y",
        translationLocal: [0, -TRANSLATION_STEP_METERS, 0],
        yawLocal: 0,
    },
    up: {
        label: "Up",
        axisHint: "-Z",
        translationLocal: [0, 0, -TRANSLATION_STEP_METERS],
        yawLocal: 0,
    },
    down: {
        label: "Down",
        axisHint: "+Z",
        translationLocal: [0, 0, TRANSLATION_STEP_METERS],
        yawLocal: 0,
    },
    yawLeft: {
        label: "Yaw Left",
        axisHint: "+Z",
        translationLocal: [0, 0, 0],
        yawLocal: YAW_STEP_RADIANS,
    },
    yawRight: {
        label: "Yaw Right",
        axisHint: "-Z",
        translationLocal: [0, 0, 0],
        yawLocal: -YAW_STEP_RADIANS,
    },
};

function parseVector(raw: string | null, fallback: [number, number, number]): [number, number, number] {
    if (!raw) {
        return fallback;
    }

    const parts = raw
        .trim()
        .split(/\s+/)
        .map((value) => Number(value));

    if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
        return fallback;
    }

    return [parts[0], parts[1], parts[2]];
}

function parseOptionalFloat(raw: string | null): number | null {
    if (raw === null) {
        return null;
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function parseOrigin(originElement: Element | null): UrdfOrigin {
    const [x, y, z] = parseVector(originElement?.getAttribute("xyz") ?? null, [0, 0, 0]);
    const [r, p, yaw] = parseVector(originElement?.getAttribute("rpy") ?? null, [0, 0, 0]);

    return {
        position: new THREE.Vector3(x, y, z),
        rotation: new THREE.Euler(r, p, yaw, "XYZ"),
    };
}

function parseUrdf(urdfText: string): ParsedUrdf {
    const parser = new DOMParser();
    const xml = parser.parseFromString(urdfText, "text/xml");
    const parseError = xml.querySelector("parsererror");

    if (parseError) {
        throw new Error("Unable to parse URDF XML.");
    }

    const robotElement = xml.querySelector("robot");
    if (!robotElement) {
        throw new Error("URDF does not contain a <robot> root element.");
    }

    const links = new Map<string, UrdfLink>();
    const jointsByParent = new Map<string, UrdfJoint[]>();
    const childLinks = new Set<string>();

    for (const linkElement of Array.from(robotElement.getElementsByTagName("link"))) {
        const name = linkElement.getAttribute("name");
        if (!name) {
            continue;
        }

        const visuals: UrdfVisual[] = [];
        for (const visualElement of Array.from(linkElement.getElementsByTagName("visual"))) {
            const geometryElement = visualElement.querySelector("geometry");
            const meshElement = geometryElement?.querySelector("mesh");
            const meshFilename = meshElement?.getAttribute("filename");

            if (!meshFilename) {
                continue;
            }

            const [sx, sy, sz] = parseVector(meshElement.getAttribute("scale"), [1, 1, 1]);
            const origin = parseOrigin(visualElement.querySelector("origin"));

            visuals.push({
                meshFilename,
                meshScale: new THREE.Vector3(sx, sy, sz),
                origin,
            });
        }

        links.set(name, { visuals });
    }

    for (const jointElement of Array.from(robotElement.getElementsByTagName("joint"))) {
        const name = jointElement.getAttribute("name");
        const type = jointElement.getAttribute("type") ?? "fixed";
        const parent = jointElement.querySelector("parent")?.getAttribute("link");
        const child = jointElement.querySelector("child")?.getAttribute("link");

        if (!name || !parent || !child) {
            continue;
        }

        const [ax, ay, az] = parseVector(jointElement.querySelector("axis")?.getAttribute("xyz") ?? null, [0, 0, 1]);
        const axis = new THREE.Vector3(ax, ay, az);
        const origin = parseOrigin(jointElement.querySelector("origin"));
        const limitElement = jointElement.querySelector("limit");
        const lowerLimit = parseOptionalFloat(limitElement?.getAttribute("lower") ?? null);
        const upperLimit = parseOptionalFloat(limitElement?.getAttribute("upper") ?? null);

        const joint: UrdfJoint = {
            name,
            type,
            parent,
            child,
            axis,
            origin,
            lowerLimit,
            upperLimit,
        };

        const joints = jointsByParent.get(parent) ?? [];
        joints.push(joint);
        jointsByParent.set(parent, joints);
        childLinks.add(child);
    }

    const rootLink = Array.from(links.keys()).find((name) => !childLinks.has(name));
    if (!rootLink) {
        throw new Error("Could not find root link in URDF.");
    }

    return {
        rootLink,
        links,
        jointsByParent,
    };
}

function findJointPathToLink(urdf: ParsedUrdf, currentLink: string, targetLink: string): UrdfJoint[] | null {
    if (currentLink === targetLink) {
        return [];
    }

    const childJoints = urdf.jointsByParent.get(currentLink) ?? [];
    for (const joint of childJoints) {
        const pathFromChild = findJointPathToLink(urdf, joint.child, targetLink);
        if (pathFromChild) {
            return [joint, ...pathFromChild];
        }
    }

    return null;
}

function resolveMeshUrl(filename: string): string {
    if (filename.startsWith("package://")) {
        const stripped = filename.slice("package://".length);
        const slashIndex = stripped.indexOf("/");

        if (slashIndex < 0) {
            throw new Error(`Invalid package URI: ${filename}`);
        }

        const packageName = stripped.slice(0, slashIndex);
        const packageRelativePath = stripped.slice(slashIndex + 1);
        const packageBasePath = PACKAGE_MAP[packageName];

        if (!packageBasePath) {
            throw new Error(`No package mapping configured for "${packageName}".`);
        }

        return `${packageBasePath.replace(/\/$/, "")}/${packageRelativePath}`;
    }

    if (filename.startsWith("/") || filename.startsWith("http://") || filename.startsWith("https://")) {
        return filename;
    }

    return `/${filename.replace(/^\.?\//, "")}`;
}

function setShadowProperties(object: THREE.Object3D): void {
    object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        }
    });
}

function shouldIgnoreColladaWarning(args: unknown[]): boolean {
    if (args.length === 0 || typeof args[0] !== "string") {
        return false;
    }

    const message = args[0];
    return (
        message.startsWith("THREE.ColladaLoader: File version") ||
        message.startsWith("THREE.ColladaLoader: You are loading an asset with a Z-UP coordinate system")
    );
}

function clampJointAngle(joint: JointControl, angle: number): number {
    if (joint.type === "continuous") {
        return angle;
    }

    let clampedAngle = angle;
    if (joint.lowerLimit !== null) {
        clampedAngle = Math.max(clampedAngle, joint.lowerLimit);
    }

    if (joint.upperLimit !== null) {
        clampedAngle = Math.min(clampedAngle, joint.upperLimit);
    }

    return clampedAngle;
}

function setJointAngle(joint: JointControl, angle: number): void {
    const clampedAngle = clampJointAngle(joint, angle);
    joint.angle = clampedAngle;
    joint.motionGroup.quaternion.setFromAxisAngle(joint.axis, clampedAngle);
}

function applyHomePose(controlChain: JointControl[]): void {
    for (const joint of controlChain) {
        const homeAngle = FR3_HOME_ANGLES[joint.name];
        if (homeAngle !== undefined) {
            setJointAngle(joint, homeAngle);
        }
    }
}

function getWorldPose(object: THREE.Object3D): EndEffectorPose {
    return {
        position: object.getWorldPosition(new THREE.Vector3()),
        quaternion: object.getWorldQuaternion(new THREE.Quaternion()).normalize(),
    };
}

function snapshotJointAngles(controlChain: JointControl[]): number[] {
    return controlChain.map((joint) => joint.angle);
}

function restoreJointAngles(controlChain: JointControl[], jointAngles: number[]): void {
    for (let index = 0; index < controlChain.length; index += 1) {
        const angle = jointAngles[index];
        if (angle === undefined) {
            continue;
        }

        setJointAngle(controlChain[index], angle);
    }
}

function quaternionToRotationVector(quaternion: THREE.Quaternion): THREE.Vector3 {
    const normalized = quaternion.clone().normalize();
    if (normalized.w < 0) {
        normalized.x *= -1;
        normalized.y *= -1;
        normalized.z *= -1;
        normalized.w *= -1;
    }

    const vectorNorm = Math.hypot(normalized.x, normalized.y, normalized.z);
    if (vectorNorm < 1e-9) {
        return new THREE.Vector3(normalized.x, normalized.y, normalized.z).multiplyScalar(2);
    }

    const angle = 2 * Math.atan2(vectorNorm, normalized.w);
    const scale = angle / vectorNorm;
    return new THREE.Vector3(normalized.x * scale, normalized.y * scale, normalized.z * scale);
}

function orientationError(currentQuaternion: THREE.Quaternion, targetQuaternion: THREE.Quaternion): THREE.Vector3 {
    const deltaQuaternion = currentQuaternion.clone().invert().multiply(targetQuaternion).normalize();
    return quaternionToRotationVector(deltaQuaternion);
}

function solveIkStep(
    robot: THREE.Object3D,
    endEffector: THREE.Object3D,
    controlChain: JointControl[],
    targetPosition: THREE.Vector3,
    targetQuaternion: THREE.Quaternion
): boolean {
    if (controlChain.length === 0) {
        return false;
    }

    for (let iteration = 0; iteration < IK_MAX_ITERATIONS; iteration += 1) {
        robot.updateMatrixWorld(true);
        const currentPose = getWorldPose(endEffector);

        const positionError = targetPosition.clone().sub(currentPose.position);
        const rotationError = orientationError(currentPose.quaternion, targetQuaternion);

        if (
            positionError.length() <= IK_POSITION_TOLERANCE &&
            rotationError.length() <= IK_ROTATION_TOLERANCE
        ) {
            return true;
        }

        const weightedError = [
            positionError.x,
            positionError.y,
            positionError.z,
            rotationError.x * IK_ROTATION_WEIGHT,
            rotationError.y * IK_ROTATION_WEIGHT,
            rotationError.z * IK_ROTATION_WEIGHT,
        ];

        const jointDeltas = new Array(controlChain.length).fill(0);

        for (let jointIndex = 0; jointIndex < controlChain.length; jointIndex += 1) {
            const joint = controlChain[jointIndex];
            const originalAngle = joint.angle;
            setJointAngle(joint, originalAngle + IK_JACOBIAN_EPSILON);

            robot.updateMatrixWorld(true);
            const perturbedPose = getWorldPose(endEffector);

            const positionColumn = perturbedPose.position
                .clone()
                .sub(currentPose.position)
                .multiplyScalar(1 / IK_JACOBIAN_EPSILON);
            const rotationColumn = orientationError(currentPose.quaternion, perturbedPose.quaternion)
                .multiplyScalar(1 / IK_JACOBIAN_EPSILON);

            const jacobianColumn = [
                positionColumn.x,
                positionColumn.y,
                positionColumn.z,
                rotationColumn.x * IK_ROTATION_WEIGHT,
                rotationColumn.y * IK_ROTATION_WEIGHT,
                rotationColumn.z * IK_ROTATION_WEIGHT,
            ];

            for (let row = 0; row < weightedError.length; row += 1) {
                jointDeltas[jointIndex] += jacobianColumn[row] * weightedError[row];
            }

            setJointAngle(joint, originalAngle);
        }

        let movedAnyJoint = false;
        for (let jointIndex = 0; jointIndex < controlChain.length; jointIndex += 1) {
            const delta = THREE.MathUtils.clamp(
                jointDeltas[jointIndex] * IK_GAIN,
                -IK_MAX_JOINT_DELTA,
                IK_MAX_JOINT_DELTA
            );

            const joint = controlChain[jointIndex];
            const previousAngle = joint.angle;
            setJointAngle(joint, previousAngle + delta);

            if (Math.abs(joint.angle - previousAngle) > 1e-8) {
                movedAnyJoint = true;
            }
        }

        if (!movedAnyJoint) {
            break;
        }
    }

    robot.updateMatrixWorld(true);
    const finalPose = getWorldPose(endEffector);
    const finalPositionError = targetPosition.clone().sub(finalPose.position).length();
    const finalRotationError = orientationError(finalPose.quaternion, targetQuaternion).length();

    return finalPositionError <= IK_POSITION_TOLERANCE * 2 && finalRotationError <= IK_ROTATION_TOLERANCE * 2;
}

function applyEndEffectorDelta(
    loadedRobot: LoadedRobot,
    translationLocal: THREE.Vector3,
    yawLocal: number,
    retryScales: readonly number[] = [1]
): boolean {
    const { robot, endEffector } = loadedRobot;
    robot.updateMatrixWorld(true);
    const currentPose = getWorldPose(endEffector);

    const worldTranslation = translationLocal.clone().applyQuaternion(currentPose.quaternion);
    const targetPosition = currentPose.position.clone().add(worldTranslation);
    const yawDelta = new THREE.Quaternion().setFromAxisAngle(LOCAL_Z_AXIS, yawLocal);
    const targetQuaternion = currentPose.quaternion.clone().multiply(yawDelta).normalize();

    return solveIkToTargetWithRetries(loadedRobot, targetPosition, targetQuaternion, retryScales);
}

function solveIkToTargetWithRetries(
    loadedRobot: LoadedRobot,
    targetPosition: THREE.Vector3,
    targetQuaternion: THREE.Quaternion,
    retryScales: readonly number[]
): boolean {
    const { robot, endEffector, controlChain } = loadedRobot;
    robot.updateMatrixWorld(true);

    const startPose = getWorldPose(endEffector);
    const startAngles = snapshotJointAngles(controlChain);

    for (const scale of retryScales) {
        restoreJointAngles(controlChain, startAngles);
        robot.updateMatrixWorld(true);

        const blendedTargetPosition = startPose.position.clone().lerp(targetPosition, scale);
        const blendedTargetQuaternion = startPose.quaternion.clone().slerp(targetQuaternion, scale).normalize();
        const solved = solveIkStep(robot, endEffector, controlChain, blendedTargetPosition, blendedTargetQuaternion);
        if (solved) {
            return true;
        }
    }

    restoreJointAngles(controlChain, startAngles);
    robot.updateMatrixWorld(true);
    return false;
}

async function loadColladaScene(colladaLoader: ColladaLoader, url: string): Promise<THREE.Object3D> {
    const previousWarn = console.warn;

    console.warn = (...args: unknown[]) => {
        if (shouldIgnoreColladaWarning(args)) {
            return;
        }

        previousWarn(...args);
    };

    try {
        const collada = await colladaLoader.loadAsync(url);

        // Keep the mesh in URDF's native frame; URDF-to-Three conversion is applied once on robot root.
        collada.scene.rotation.set(0, 0, 0);
        collada.scene.updateMatrixWorld(true);

        return collada.scene;
    } finally {
        console.warn = previousWarn;
    }
}

async function loadVisualObject(
    visual: UrdfVisual,
    colladaLoader: ColladaLoader,
    stlLoader: STLLoader,
    objectCache: Map<string, THREE.Object3D>,
    missingMeshes: Set<string>
): Promise<THREE.Object3D> {
    const url = resolveMeshUrl(visual.meshFilename);
    let cachedObject = objectCache.get(url);

    if (!cachedObject) {
        try {
            if (url.toLowerCase().endsWith(".dae")) {
                cachedObject = await loadColladaScene(colladaLoader, url);
            } else if (url.toLowerCase().endsWith(".stl")) {
                const geometry = await stlLoader.loadAsync(url);
                cachedObject = new THREE.Mesh(
                    geometry,
                    new THREE.MeshStandardMaterial({
                        color: "#9ca3af",
                        metalness: 0.22,
                        roughness: 0.68,
                    })
                );
            } else {
                throw new Error(`Unsupported mesh format for ${url}`);
            }

            setShadowProperties(cachedObject);
            objectCache.set(url, cachedObject);
        } catch {
            missingMeshes.add(url);
            cachedObject = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, 0.03, 0.03),
                new THREE.MeshStandardMaterial({
                    color: "#ef4444",
                    metalness: 0.1,
                    roughness: 0.8,
                })
            );
            setShadowProperties(cachedObject);
            objectCache.set(url, cachedObject);
        }
    }

    const visualGroup = new THREE.Group();
    visualGroup.position.copy(visual.origin.position);
    visualGroup.rotation.copy(visual.origin.rotation);

    const objectInstance = cachedObject.clone(true);
    objectInstance.scale.multiply(visual.meshScale);
    visualGroup.add(objectInstance);

    return visualGroup;
}

async function buildLinkTree(
    linkName: string,
    urdf: ParsedUrdf,
    colladaLoader: ColladaLoader,
    stlLoader: STLLoader,
    objectCache: Map<string, THREE.Object3D>,
    missingMeshes: Set<string>,
    controllableJoints: Map<string, JointControl>
): Promise<THREE.Object3D> {
    const link = urdf.links.get(linkName);
    const linkGroup = new THREE.Group();
    linkGroup.name = linkName;

    if (link) {
        for (const visual of link.visuals) {
            const visualObject = await loadVisualObject(visual, colladaLoader, stlLoader, objectCache, missingMeshes);
            linkGroup.add(visualObject);
        }
    }

    const childJoints = urdf.jointsByParent.get(linkName) ?? [];
    for (const joint of childJoints) {
        const jointOriginGroup = new THREE.Group();
        jointOriginGroup.name = `${joint.name}_origin`;
        jointOriginGroup.position.copy(joint.origin.position);
        jointOriginGroup.rotation.copy(joint.origin.rotation);

        const jointMotionGroup = new THREE.Group();
        jointMotionGroup.name = `${joint.name}_motion`;

        if ((joint.type === "revolute" || joint.type === "continuous") && joint.axis.lengthSq() > 0) {
            const axis = joint.axis.clone().normalize();
            jointMotionGroup.quaternion.setFromAxisAngle(axis, 0);
            controllableJoints.set(joint.name, {
                name: joint.name,
                type: joint.type,
                axis,
                motionGroup: jointMotionGroup,
                lowerLimit: joint.lowerLimit,
                upperLimit: joint.upperLimit,
                angle: 0,
            });
        }

        const childLinkGroup = await buildLinkTree(
            joint.child,
            urdf,
            colladaLoader,
            stlLoader,
            objectCache,
            missingMeshes,
            controllableJoints
        );
        jointMotionGroup.add(childLinkGroup);
        jointOriginGroup.add(jointMotionGroup);
        linkGroup.add(jointOriginGroup);
    }

    return linkGroup;
}

async function loadFr3UrdfRobot(): Promise<LoadedRobot> {
    const response = await fetch(URDF_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch URDF (${response.status}).`);
    }

    const urdfText = await response.text();
    const urdf = parseUrdf(urdfText);
    const colladaLoader = new ColladaLoader();
    const stlLoader = new STLLoader();
    const objectCache = new Map<string, THREE.Object3D>();
    const missingMeshes = new Set<string>();
    const controllableJoints = new Map<string, JointControl>();

    const robot = await buildLinkTree(
        urdf.rootLink,
        urdf,
        colladaLoader,
        stlLoader,
        objectCache,
        missingMeshes,
        controllableJoints
    );
    robot.name = "fr3_urdf";

    // URDF uses Z-up frames; rotate to match Three.js Y-up scene.
    robot.rotation.x = -Math.PI / 2;

    const endEffector = robot.getObjectByName(END_EFFECTOR_LINK);
    if (!endEffector) {
        throw new Error(`Could not find end-effector link "${END_EFFECTOR_LINK}" in URDF tree.`);
    }

    const jointPath = findJointPathToLink(urdf, urdf.rootLink, END_EFFECTOR_LINK);
    if (!jointPath) {
        throw new Error(`Could not find a kinematic path from "${urdf.rootLink}" to "${END_EFFECTOR_LINK}".`);
    }

    const controlChain: JointControl[] = [];
    for (const joint of jointPath) {
        const control = controllableJoints.get(joint.name);
        if (control) {
            controlChain.push(control);
        }
    }

    if (controlChain.length === 0) {
        throw new Error("No controllable joints were found on the end-effector chain.");
    }

    applyHomePose(controlChain);
    robot.updateMatrixWorld(true);

    return {
        robot,
        missingMeshes: Array.from(missingMeshes),
        endEffector,
        controlChain,
    };
}

export default function LxvInteractivePreview() {
    const containerRef = useRef<HTMLDivElement>(null);
    const loadedRobotRef = useRef<LoadedRobot | null>(null);
    const activePadCommandRef = useRef<PadCommandKey | null>(null);
    const holdIntervalRef = useRef<number | null>(null);
    const trajectoryIntervalRef = useRef<number | null>(null);
    const trajectoryStartTimeRef = useRef<number>(0);
    const trajectoryBasePoseRef = useRef<EndEffectorPose | null>(null);
    const trajectoryConsecutiveFailuresRef = useRef(0);
    const [loading, setLoading] = useState(true);
    const [controlsEnabled, setControlsEnabled] = useState(false);
    const [trajectoryRunning, setTrajectoryRunning] = useState(false);
    const [statusText, setStatusText] = useState("Loading FR3 URDF...");
    const [padStatusText, setPadStatusText] = useState("Control pad disabled while loading.");

    const clearTrajectoryLoop = useCallback(() => {
        if (trajectoryIntervalRef.current !== null) {
            window.clearInterval(trajectoryIntervalRef.current);
            trajectoryIntervalRef.current = null;
        }

        trajectoryBasePoseRef.current = null;
        trajectoryConsecutiveFailuresRef.current = 0;
        setTrajectoryRunning(false);
    }, []);

    const executePadCommand = useCallback((commandKey: PadCommandKey, stepScale = 1): boolean => {
        const loadedRobot = loadedRobotRef.current;
        if (!loadedRobot) {
            return false;
        }

        const command = HAND_FRAME_COMMANDS[commandKey];
        const [x, y, z] = command.translationLocal;
        const solved = applyEndEffectorDelta(
            loadedRobot,
            new THREE.Vector3(x * stepScale, y * stepScale, z * stepScale),
            command.yawLocal * stepScale,
            PAD_COMMAND_RETRY_SCALES
        );

        if (!solved) {
            setPadStatusText("Reached local motion boundary. Try the opposite direction or smaller moves.");
            return false;
        }

        setPadStatusText(PAD_READY_STATUS);
        return true;
    }, []);

    const stopContinuousPadCommand = useCallback(() => {
        activePadCommandRef.current = null;
        if (holdIntervalRef.current !== null) {
            window.clearInterval(holdIntervalRef.current);
            holdIntervalRef.current = null;
        }
    }, []);

    const startContinuousPadCommand = useCallback(
        (commandKey: PadCommandKey, event: ReactPointerEvent<HTMLButtonElement>) => {
            if (!controlsEnabled) {
                return;
            }

            clearTrajectoryLoop();

            event.preventDefault();
            try {
                event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
                // Pointer capture can fail in edge cases; hold behavior still works via window listeners.
            }

            stopContinuousPadCommand();
            activePadCommandRef.current = commandKey;

            const initialSolved = executePadCommand(commandKey, PAD_HOLD_STEP_SCALE);
            if (!initialSolved) {
                stopContinuousPadCommand();
                return;
            }

            holdIntervalRef.current = window.setInterval(() => {
                const activeCommand = activePadCommandRef.current;
                if (!activeCommand) {
                    return;
                }

                const solved = executePadCommand(activeCommand, PAD_HOLD_STEP_SCALE);
                if (!solved) {
                    stopContinuousPadCommand();
                }
            }, PAD_HOLD_REPEAT_MS);
        },
        [clearTrajectoryLoop, controlsEnabled, executePadCommand, stopContinuousPadCommand]
    );

    const handlePadButtonClick = useCallback(
        (commandKey: PadCommandKey, event: ReactMouseEvent<HTMLButtonElement>) => {
            // detail === 0 corresponds to keyboard activation; pointer presses are handled onPointerDown.
            if (event.detail === 0) {
                executePadCommand(commandKey);
            }
        },
        [executePadCommand]
    );

    const startDefaultTrajectory = useCallback(() => {
        if (!controlsEnabled) {
            return;
        }

        const loadedRobot = loadedRobotRef.current;
        if (!loadedRobot) {
            return;
        }

        stopContinuousPadCommand();
        clearTrajectoryLoop();

        loadedRobot.robot.updateMatrixWorld(true);
        trajectoryBasePoseRef.current = getWorldPose(loadedRobot.endEffector);
        trajectoryStartTimeRef.current = performance.now();
        trajectoryConsecutiveFailuresRef.current = 0;
        setTrajectoryRunning(true);
        setPadStatusText("Running default trajectory. Press Stop to interrupt.");

        trajectoryIntervalRef.current = window.setInterval(() => {
            const activeRobot = loadedRobotRef.current;
            const basePose = trajectoryBasePoseRef.current;
            if (!activeRobot || !basePose) {
                return;
            }

            const elapsedSeconds = (performance.now() - trajectoryStartTimeRef.current) / 1000;
            const omega = (2 * Math.PI) / TRAJECTORY_PERIOD_SECONDS;

            const offsetInHandFrame = new THREE.Vector3(
                TRAJECTORY_X_AMPLITUDE_METERS * Math.sin(omega * elapsedSeconds),
                TRAJECTORY_Y_AMPLITUDE_METERS * Math.sin(2 * omega * elapsedSeconds),
                TRAJECTORY_Z_AMPLITUDE_METERS * Math.sin(omega * elapsedSeconds + Math.PI / 2)
            );
            const yaw = TRAJECTORY_YAW_AMPLITUDE_RADIANS * Math.sin(omega * elapsedSeconds);

            const targetPosition = basePose.position
                .clone()
                .add(offsetInHandFrame.applyQuaternion(basePose.quaternion));
            const targetQuaternion = basePose.quaternion
                .clone()
                .multiply(new THREE.Quaternion().setFromAxisAngle(LOCAL_Z_AXIS, yaw))
                .normalize();

            const solved = solveIkToTargetWithRetries(
                activeRobot,
                targetPosition,
                targetQuaternion,
                TRAJECTORY_TARGET_RETRY_SCALES
            );

            if (!solved) {
                trajectoryConsecutiveFailuresRef.current += 1;
                if (trajectoryConsecutiveFailuresRef.current >= TRAJECTORY_MAX_CONSECUTIVE_FAILURES) {
                    clearTrajectoryLoop();
                    setPadStatusText("Trajectory paused after repeated IK misses. Move the robot and try Start again.");
                }
                return;
            }

            trajectoryConsecutiveFailuresRef.current = 0;
        }, TRAJECTORY_UPDATE_MS);
    }, [clearTrajectoryLoop, controlsEnabled, stopContinuousPadCommand]);

    const stopDefaultTrajectory = useCallback(() => {
        clearTrajectoryLoop();
        setPadStatusText(PAD_READY_STATUS);
    }, [clearTrajectoryLoop]);

    useEffect(() => {
        const handlePointerRelease = () => {
            stopContinuousPadCommand();
        };

        window.addEventListener("pointerup", handlePointerRelease);
        window.addEventListener("pointercancel", handlePointerRelease);
        window.addEventListener("blur", handlePointerRelease);

        return () => {
            window.removeEventListener("pointerup", handlePointerRelease);
            window.removeEventListener("pointercancel", handlePointerRelease);
            window.removeEventListener("blur", handlePointerRelease);
            stopContinuousPadCommand();
            clearTrajectoryLoop();
        };
    }, [clearTrajectoryLoop, stopContinuousPadCommand]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#020617");

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 200);
        camera.position.set(1.8, 1.2, 1.8);
        camera.lookAt(0, 0.5, 0);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 0.4;
        controls.maxDistance = 8;
        controls.target.set(0, 0.5, 0);
        controls.update();

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
        scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
        mainLight.position.set(2.5, 4, 3);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 1024;
        mainLight.shadow.mapSize.height = 1024;
        mainLight.shadow.camera.near = 0.1;
        mainLight.shadow.camera.far = 20;
        mainLight.shadow.camera.left = -3;
        mainLight.shadow.camera.right = 3;
        mainLight.shadow.camera.top = 3;
        mainLight.shadow.camera.bottom = -3;
        scene.add(mainLight);

        const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
        rimLight.position.set(-2, 2.5, -3);
        scene.add(rimLight);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(6, 6),
            new THREE.ShadowMaterial({ opacity: 0.3 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.001;
        ground.receiveShadow = true;
        scene.add(ground);

        let animationFrame: number | null = null;
        let disposed = false;

        const animate = () => {
            if (disposed) {
                return;
            }

            animationFrame = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };

        const onResize = () => {
            if (!container) {
                return;
            }

            const width = container.clientWidth;
            const height = container.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };

        window.addEventListener("resize", onResize);

        loadFr3UrdfRobot()
            .then((loadedRobot) => {
                if (disposed) {
                    return;
                }

                scene.add(loadedRobot.robot);
                loadedRobotRef.current = loadedRobot;
                setControlsEnabled(true);
                setPadStatusText(PAD_READY_STATUS);

                const bounds = new THREE.Box3().setFromObject(loadedRobot.robot);
                const center = bounds.getCenter(new THREE.Vector3());
                const size = bounds.getSize(new THREE.Vector3());
                const diagonal = Math.max(size.length(), 1);

                controls.target.copy(center);
                controls.minDistance = Math.max(diagonal * 0.25, 0.35);
                controls.maxDistance = Math.max(diagonal * 4.5, 4);
                camera.position.set(
                    center.x + diagonal * 0.9,
                    center.y + diagonal * 0.55,
                    center.z + diagonal * 0.9
                );
                camera.lookAt(center);
                controls.update();

                if (loadedRobot.missingMeshes.length > 0) {
                    setStatusText(
                        `URDF loaded, but ${loadedRobot.missingMeshes.length} mesh file(s) are missing from /franka_description.`
                    );
                } else {
                    setStatusText("FR3 URDF loaded.");
                }
            })
            .catch((error) => {
                if (disposed) {
                    return;
                }

                setStatusText(error instanceof Error ? error.message : "Failed to load FR3 URDF.");
                setPadStatusText("Control pad unavailable.");
                setControlsEnabled(false);
            })
            .finally(() => {
                if (disposed) {
                    return;
                }

                setLoading(false);
            });

        animate();

        return () => {
            disposed = true;
            stopContinuousPadCommand();
            clearTrajectoryLoop();
            loadedRobotRef.current = null;
            window.removeEventListener("resize", onResize);
            controls.dispose();
            if (animationFrame !== null) {
                cancelAnimationFrame(animationFrame);
            }
            renderer.dispose();
            scene.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (mesh.isMesh) {
                    mesh.geometry.dispose();

                    if (Array.isArray(mesh.material)) {
                        for (const material of mesh.material) {
                            material.dispose();
                        }
                    } else {
                        mesh.material.dispose();
                    }
                }
            });
            if (renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }
        };
    }, [clearTrajectoryLoop, stopContinuousPadCommand]);

    const buttonClass =
        "rounded-md border border-slate-600 bg-slate-800/70 px-2 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700/90 disabled:cursor-not-allowed disabled:opacity-40";

    return (
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/55 p-5">
            <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/90">
                <div ref={containerRef} className="relative h-[420px] w-full">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/50">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-600 border-t-slate-200" />
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">End-Effector Pad (Hand Frame)</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={!controlsEnabled || trajectoryRunning}
                        onClick={startDefaultTrajectory}
                    >
                        Start Trajectory
                    </button>
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={!controlsEnabled || !trajectoryRunning}
                        onClick={stopDefaultTrajectory}
                    >
                        Stop Trajectory
                    </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                        <div className="grid grid-cols-3 gap-2">
                            <div />
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={!controlsEnabled}
                                onPointerDown={(event) => startContinuousPadCommand("front", event)}
                                onPointerUp={stopContinuousPadCommand}
                                onPointerCancel={stopContinuousPadCommand}
                                onLostPointerCapture={stopContinuousPadCommand}
                                onClick={(event) => handlePadButtonClick("front", event)}
                                title={HAND_FRAME_COMMANDS.front.axisHint}
                            >
                                {HAND_FRAME_COMMANDS.front.label}
                            </button>
                            <div />

                            <button
                                type="button"
                                className={buttonClass}
                                disabled={!controlsEnabled}
                                onPointerDown={(event) => startContinuousPadCommand("left", event)}
                                onPointerUp={stopContinuousPadCommand}
                                onPointerCancel={stopContinuousPadCommand}
                                onLostPointerCapture={stopContinuousPadCommand}
                                onClick={(event) => handlePadButtonClick("left", event)}
                                title={HAND_FRAME_COMMANDS.left.axisHint}
                            >
                                {HAND_FRAME_COMMANDS.left.label}
                            </button>
                            <div className="rounded-md border border-dashed border-slate-700/80 bg-slate-900/70 px-2 py-2 text-center text-xs text-slate-500">
                                XY
                            </div>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={!controlsEnabled}
                                onPointerDown={(event) => startContinuousPadCommand("right", event)}
                                onPointerUp={stopContinuousPadCommand}
                                onPointerCancel={stopContinuousPadCommand}
                                onLostPointerCapture={stopContinuousPadCommand}
                                onClick={(event) => handlePadButtonClick("right", event)}
                                title={HAND_FRAME_COMMANDS.right.axisHint}
                            >
                                {HAND_FRAME_COMMANDS.right.label}
                            </button>

                            <div />
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={!controlsEnabled}
                                onPointerDown={(event) => startContinuousPadCommand("back", event)}
                                onPointerUp={stopContinuousPadCommand}
                                onPointerCancel={stopContinuousPadCommand}
                                onLostPointerCapture={stopContinuousPadCommand}
                                onClick={(event) => handlePadButtonClick("back", event)}
                                title={HAND_FRAME_COMMANDS.back.axisHint}
                            >
                                {HAND_FRAME_COMMANDS.back.label}
                            </button>
                            <div />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={!controlsEnabled}
                            onPointerDown={(event) => startContinuousPadCommand("up", event)}
                            onPointerUp={stopContinuousPadCommand}
                            onPointerCancel={stopContinuousPadCommand}
                            onLostPointerCapture={stopContinuousPadCommand}
                            onClick={(event) => handlePadButtonClick("up", event)}
                            title={HAND_FRAME_COMMANDS.up.axisHint}
                        >
                            {HAND_FRAME_COMMANDS.up.label}
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={!controlsEnabled}
                            onPointerDown={(event) => startContinuousPadCommand("down", event)}
                            onPointerUp={stopContinuousPadCommand}
                            onPointerCancel={stopContinuousPadCommand}
                            onLostPointerCapture={stopContinuousPadCommand}
                            onClick={(event) => handlePadButtonClick("down", event)}
                            title={HAND_FRAME_COMMANDS.down.axisHint}
                        >
                            {HAND_FRAME_COMMANDS.down.label}
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={!controlsEnabled}
                            onPointerDown={(event) => startContinuousPadCommand("yawLeft", event)}
                            onPointerUp={stopContinuousPadCommand}
                            onPointerCancel={stopContinuousPadCommand}
                            onLostPointerCapture={stopContinuousPadCommand}
                            onClick={(event) => handlePadButtonClick("yawLeft", event)}
                            title={HAND_FRAME_COMMANDS.yawLeft.axisHint}
                        >
                            {HAND_FRAME_COMMANDS.yawLeft.label}
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={!controlsEnabled}
                            onPointerDown={(event) => startContinuousPadCommand("yawRight", event)}
                            onPointerUp={stopContinuousPadCommand}
                            onPointerCancel={stopContinuousPadCommand}
                            onLostPointerCapture={stopContinuousPadCommand}
                            onClick={(event) => handlePadButtonClick("yawRight", event)}
                            title={HAND_FRAME_COMMANDS.yawRight.axisHint}
                        >
                            {HAND_FRAME_COMMANDS.yawRight.label}
                        </button>
                    </div>
                </div>
            </div>

            <p className="mt-3 text-sm text-slate-400">{statusText}</p>
            <p className="mt-1 text-xs text-slate-500">{padStatusText}</p>
        </div>
    );
}
